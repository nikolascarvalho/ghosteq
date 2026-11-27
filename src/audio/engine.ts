// Motor de áudio em tempo real (Web Audio API). O caminho do som em si
// (A/B, convolver, volume, limiter) mora em graph.ts; aqui ficam as partes que
// só existem "ao vivo": o AudioContext, as fontes (entrada, arquivo, loop), a
// saída (setSinkId), latências e estalos.
//
//   fonte → [splitter → canais escolhidos] → MonitorGraph → saída
//
// - O IR usado é EXATAMENTE o exportado (mesmo array).
// - Nenhuma lógica de estado/tela aqui: a camada state/ chama estes métodos.
import { resampleIr } from '../dsp';
import { MonitorGraph, loadLimiter, type AB } from './graph';
import { ENGINE_SAMPLE_RATE, loudnessCompensation, rms } from './helpers';
import { rawAudioConstraints } from './liveInput';

export { ENGINE_SAMPLE_RATE };
export type { AB };

export interface LiveSourceInfo {
  channelCount: number;
  trackLatency: number | null;
  trackSampleRate: number | null;
  label: string;
}

export interface EngineOptions {
  /** true = latencyHint 0 (o menor buffer que o navegador aceitar). */
  lowLatency: boolean;
}

export interface GlitchStats {
  events: number;
  durationMs: number;
}

/**
 * Estatísticas de "underrun" (o navegador não conseguiu entregar o áudio a
 * tempo = estalo), quando o navegador informa. Duas versões da mesma API:
 * `playbackStats` (atual, duração em s) e `playoutStats` (antiga, em ms).
 */
function readUnderruns(ctx: AudioContext): { events: number; durationS: number } | null {
  const c = ctx as unknown as {
    playbackStats?: { underrunEvents?: number; underrunDuration?: number };
    playoutStats?: { fallbackFramesEvents?: number; fallbackFramesDuration?: number };
  };
  try {
    const p = c.playbackStats;
    if (p && typeof p.underrunEvents === 'number')
      return { events: p.underrunEvents, durationS: p.underrunDuration ?? 0 };
    const o = c.playoutStats;
    if (o && typeof o.fallbackFramesEvents === 'number')
      return { events: o.fallbackFramesEvents, durationS: (o.fallbackFramesDuration ?? 0) / 1000 };
  } catch {
    /* API presente mas indisponível neste contexto */
  }
  return null;
}

/** Taxa "nativa" do dispositivo de saída: um AudioContext sem sampleRate usa a do hardware. */
export async function probeOutputRate(sinkId?: string): Promise<number | null> {
  try {
    const opts = sinkId ? ({ sinkId } as AudioContextOptions) : undefined;
    const c = new AudioContext(opts);
    const sr = c.sampleRate;
    await c.close();
    return sr;
  } catch {
    return null;
  }
}

/** Segundos de aquecimento ignorados na contagem de estalos (abrir o dispositivo costuma falhar 1×). */
const GLITCH_WARMUP_S = 2;

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly graph: MonitorGraph;
  readonly latencyHint: AudioContextLatencyCategory | number;
  /** Analisadores por canal da entrada ao vivo (para os medidores). */
  liveChannelAnalysers: AnalyserNode[] = [];

  private matchTimer: ReturnType<typeof setInterval> | null = null;
  private stopCurrent: (() => void) | null = null;
  private live: { splitter: ChannelSplitterNode; picked: GainNode; outputs: number } | null = null;
  private glitchBase: { events: number; durationS: number } | null = null;

  /** Cria o contexto, carrega o worklet do limiter e monta o grafo. */
  static async create(opts: EngineOptions): Promise<AudioEngine> {
    const latencyHint: AudioContextLatencyCategory | number = opts.lowLatency ? 0 : 'interactive';
    const ctx = new AudioContext({ sampleRate: ENGINE_SAMPLE_RATE, latencyHint });
    const worklet = await loadLimiter(ctx);
    return new AudioEngine(ctx, worklet, latencyHint);
  }

  private constructor(
    ctx: AudioContext,
    worklet: boolean,
    latencyHint: AudioContextLatencyCategory | number,
  ) {
    this.ctx = ctx;
    this.latencyHint = latencyHint;
    this.graph = new MonitorGraph(ctx, { worklet });
  }

  get analyserBefore(): AnalyserNode {
    return this.graph.analyserBefore;
  }
  get analyserAfter(): AnalyserNode {
    return this.graph.analyserAfter;
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  // ---------- IR ----------

  /** Troca o IR do caminho B (resample se a taxa do IR ≠ da do contexto). */
  setIr(samples: ArrayLike<number>, sampleRate: number): void {
    const data =
      sampleRate === this.ctx.sampleRate ? samples : resampleIr(samples, sampleRate, this.ctx.sampleRate);
    const buf = new AudioBuffer({
      numberOfChannels: 1,
      length: data.length,
      sampleRate: this.ctx.sampleRate,
    });
    buf.copyToChannel(Float32Array.from(data), 0);
    this.graph.setIrBuffer(buf);
  }

  // ---------- Controles ----------

  setAB(ab: AB): void {
    this.graph.setAB(ab);
  }

  /** Liga a compensação de volume: o caminho B é ajustado para ter o mesmo RMS do A. */
  setLoudnessMatch(on: boolean): void {
    if (this.matchTimer) clearInterval(this.matchTimer);
    this.matchTimer = null;
    const g = this.graph.wetComp.gain;
    if (!on) {
      g.setTargetAtTime(1, this.ctx.currentTime, 0.05);
      return;
    }
    const { rmsIn, rmsWet } = this.graph;
    const a = new Float32Array(rmsIn.fftSize);
    const b = new Float32Array(rmsWet.fftSize);
    this.matchTimer = setInterval(() => {
      rmsIn.getFloatTimeDomainData(a);
      rmsWet.getFloatTimeDomainData(b);
      const comp = loudnessCompensation(rms(a), rms(b));
      // constante de tempo de 0,3 s: acompanha a música sem "bombear"
      if (comp !== null) g.setTargetAtTime(comp, this.ctx.currentTime, 0.3);
    }, 100);
  }

  setVolumeDb(db: number): void {
    this.graph.setVolumeDb(db);
  }

  setMuted(muted: boolean): void {
    this.graph.setMuted(muted);
  }

  /** Quanto o limiter está reduzindo agora (dB, ≤ 0); null no fallback sem worklet. */
  get limiterReductionDb(): number | null {
    return this.graph.reductionDb;
  }

  latency(): { base: number | null; output: number | null } {
    const out = this.ctx.outputLatency;
    return {
      base: typeof this.ctx.baseLatency === 'number' ? this.ctx.baseLatency : null,
      // Alguns navegadores devolvem 0 até o áudio começar a sair: 0 = "ainda não sei".
      output: typeof out === 'number' && out > 0 ? out : null,
    };
  }

  /** Estalos desde o aquecimento; null se o navegador não informa. */
  glitchStats(): GlitchStats | null {
    const raw = readUnderruns(this.ctx);
    if (!raw) return null;
    if (!this.glitchBase) {
      if (this.ctx.currentTime < GLITCH_WARMUP_S) return { events: 0, durationMs: 0 };
      this.glitchBase = raw;
    }
    return {
      events: Math.max(0, raw.events - this.glitchBase.events),
      durationMs: Math.max(0, (raw.durationS - this.glitchBase.durationS) * 1000),
    };
  }

  /** Escolhe o dispositivo de saída (Chrome/Edge). */
  async setSinkId(id: string): Promise<void> {
    const ctx = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (ctx.setSinkId) await ctx.setSinkId(id);
  }

  // ---------- Fontes ----------

  stopSource(): void {
    this.stopCurrent?.();
    this.stopCurrent = null;
    this.liveChannelAnalysers = [];
  }

  /** Toca um AudioBuffer em loop (gravação do usuário ou loop de exemplo). */
  playBuffer(buffer: AudioBuffer): void {
    this.stopSource();
    const src = new AudioBufferSourceNode(this.ctx, { buffer, loop: true });
    src.connect(this.graph.input);
    src.start();
    this.stopCurrent = () => {
      try {
        src.stop();
      } catch {
        /* já parado */
      }
      src.disconnect();
    };
  }

  async decodeFile(data: ArrayBuffer): Promise<AudioBuffer> {
    return this.ctx.decodeAudioData(data);
  }

  bufferFromSamples(samples: Float32Array, sampleRate: number): AudioBuffer {
    const buf = new AudioBuffer({ numberOfChannels: 1, length: samples.length, sampleRate });
    buf.copyToChannel(Float32Array.from(samples), 0);
    return buf;
  }

  /**
   * Entrada ao vivo: abre o dispositivo com as mesmas configurações "cruas" do
   * diagnóstico e soma (média) só os canais escolhidos (ex.: 3+4 do Nano).
   * Os medidores por canal ficam em ramificação paralela, fora do caminho do som.
   */
  async startLive(deviceId: string, channels: number[]): Promise<LiveSourceInfo> {
    this.stopSource();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: rawAudioConstraints(deviceId) });
    const track = stream.getAudioTracks()[0]!;
    const src = this.ctx.createMediaStreamSource(stream);
    const n = Math.max(1, track.getSettings().channelCount ?? 2);
    const splitter = this.ctx.createChannelSplitter(Math.max(n, ...channels.map((c) => c + 1)));
    src.connect(splitter);
    const picked = new GainNode(this.ctx, { gain: 1 });
    picked.connect(this.graph.input);
    this.live = { splitter, picked, outputs: splitter.numberOfOutputs };
    this.setLiveChannels(channels);
    this.liveChannelAnalysers = Array.from({ length: n }, (_, i) => {
      const a = new AnalyserNode(this.ctx, { fftSize: 2048, smoothingTimeConstant: 0 });
      splitter.connect(a, i);
      return a;
    });
    this.stopCurrent = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      src.disconnect();
      splitter.disconnect();
      picked.disconnect();
      this.live = null;
    };
    const s = track.getSettings() as MediaTrackSettings & { latency?: number };
    return {
      channelCount: n,
      trackLatency: typeof s.latency === 'number' ? s.latency : null,
      trackSampleRate: typeof s.sampleRate === 'number' ? s.sampleRate : null,
      label: track.label,
    };
  }

  /**
   * Troca quais canais da entrada ao vivo entram no processamento (média deles),
   * sem reabrir o dispositivo. Os medidores por canal continuam ligados.
   */
  setLiveChannels(channels: number[]): void {
    const live = this.live;
    if (!live) return;
    for (let i = 0; i < live.outputs; i++) {
      try {
        live.splitter.disconnect(live.picked, i);
      } catch {
        /* esta saída não estava ligada */
      }
    }
    const valid = channels.filter((c) => c < live.outputs);
    for (const ch of valid) live.splitter.connect(live.picked, ch);
    live.picked.gain.value = 1 / Math.max(1, valid.length);
  }

  async close(): Promise<void> {
    this.stopSource();
    if (this.matchTimer) clearInterval(this.matchTimer);
    if (this.ctx.state !== 'closed') await this.ctx.close();
  }
}
