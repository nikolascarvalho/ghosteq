// Motor de áudio (Web Audio API). Monta o "grafo" — uma rede de nós de áudio,
// como um DAG de transformações num pipeline de dados:
//
//   fonte → entrada (mono) ─┬─ A: original ──────────────────────────┐
//                           └─ B: convolver A/B (IR) → compensação ──┤
//                                                                    ↓
//                     mix → volume → limiter → hard clip (−1 dBFS) → mudo → saída
//
// - O IR usado é EXATAMENTE o exportado (mesmo array). Trocar de IR usa dois
//   convolvers alternados com crossfade, para não estalar.
// - Nenhuma lógica de estado/tela aqui: a camada state/ chama estes métodos.
import { resampleIr } from '../dsp';
import { rawAudioConstraints } from './liveInput';
import { CROSSFADE_S, START_VOLUME_DB, dbToLin, hardClipCurve, loudnessCompensation, rms } from './helpers';

export const ENGINE_SAMPLE_RATE = 48000;
export type AB = 'A' | 'B';

export interface LiveSourceInfo {
  channelCount: number;
  trackLatency: number | null;
  label: string;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  /** Analisadores para o espectro: antes (original) e depois (com IR). */
  readonly analyserBefore: AnalyserNode;
  readonly analyserAfter: AnalyserNode;
  /** Analisadores por canal da entrada ao vivo (para os medidores). */
  liveChannelAnalysers: AnalyserNode[] = [];

  private input: GainNode;
  private dryAB: GainNode;
  private wetAB: GainNode;
  private wetComp: GainNode;
  private convs: [ConvolverNode, ConvolverNode];
  private convGains: [GainNode, GainNode];
  private active = 0;
  private hasIr = false;
  private swapping = false;
  private pendingIr: AudioBuffer | null = null;
  private volume: GainNode;
  private limiter: DynamicsCompressorNode;
  private muteGain: GainNode;
  private rmsIn: AnalyserNode;
  private rmsWet: AnalyserNode;
  private matchTimer: ReturnType<typeof setInterval> | null = null;
  private stopCurrent: (() => void) | null = null;
  private live: { splitter: ChannelSplitterNode; picked: GainNode; outputs: number } | null = null;

  constructor(ctx?: AudioContext) {
    this.ctx = ctx ?? new AudioContext({ sampleRate: ENGINE_SAMPLE_RATE, latencyHint: 'interactive' });
    const c = this.ctx;

    // Entrada forçada a mono: qualquer fonte estéreo é somada aqui.
    this.input = new GainNode(c, {
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });

    this.dryAB = new GainNode(c, { gain: 0 });
    this.wetAB = new GainNode(c, { gain: 1 });
    this.wetComp = new GainNode(c, { gain: 1 });
    // normalize = false ANTES de receber o buffer: o IR toca com o ganho real (ex.: +9 dB).
    this.convs = [
      new ConvolverNode(c, { disableNormalization: true }),
      new ConvolverNode(c, { disableNormalization: true }),
    ];
    this.convGains = [new GainNode(c, { gain: 1 }), new GainNode(c, { gain: 0 })];
    const wetSum = new GainNode(c);

    this.analyserBefore = new AnalyserNode(c, { fftSize: 8192, smoothingTimeConstant: 0.8 });
    this.analyserAfter = new AnalyserNode(c, { fftSize: 8192, smoothingTimeConstant: 0.8 });
    this.rmsIn = new AnalyserNode(c, { fftSize: 4096 });
    this.rmsWet = new AnalyserNode(c, { fftSize: 4096 });

    const mix = new GainNode(c);
    this.volume = new GainNode(c, { gain: dbToLin(START_VOLUME_DB) });
    // Limiter: compressor rápido e de razão alta…
    this.limiter = new DynamicsCompressorNode(c, {
      threshold: -3,
      knee: 0,
      ratio: 20,
      attack: 0.001,
      release: 0.1,
    });
    // …e, depois dele, um hard clip que garante o teto de −1 dBFS.
    const clipper = new WaveShaperNode(c, { curve: hardClipCurve(), oversample: '4x' });
    this.muteGain = new GainNode(c, { gain: 1 });

    // Caminho A (original)
    this.input.connect(this.dryAB).connect(mix);
    // Caminho B (com IR)
    for (let i = 0; i < 2; i++)
      this.input.connect(this.convs[i]!).connect(this.convGains[i]!).connect(wetSum);
    wetSum.connect(this.wetComp).connect(this.wetAB).connect(mix);
    // Medições
    this.input.connect(this.analyserBefore);
    this.input.connect(this.rmsIn);
    wetSum.connect(this.rmsWet);
    this.wetComp.connect(this.analyserAfter);
    // Saída protegida
    mix
      .connect(this.volume)
      .connect(this.limiter)
      .connect(clipper)
      .connect(this.muteGain)
      .connect(c.destination);
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
    this.swapIr(buf);
  }

  private swapIr(buf: AudioBuffer): void {
    if (!this.hasIr) {
      this.convs[0].buffer = buf;
      this.hasIr = true;
      return;
    }
    if (this.swapping) {
      this.pendingIr = buf; // aplica o mais recente quando a troca atual terminar
      return;
    }
    const t = this.ctx.currentTime;
    const next = this.active === 0 ? 1 : 0;
    this.convs[next]!.buffer = buf;
    const gIn = this.convGains[next]!.gain;
    const gOut = this.convGains[this.active]!.gain;
    gIn.cancelScheduledValues(t);
    gOut.cancelScheduledValues(t);
    gIn.setValueAtTime(0, t);
    gIn.linearRampToValueAtTime(1, t + CROSSFADE_S);
    gOut.setValueAtTime(gOut.value, t);
    gOut.linearRampToValueAtTime(0, t + CROSSFADE_S);
    this.active = next;
    this.swapping = true;
    setTimeout(
      () => {
        this.swapping = false;
        const p = this.pendingIr;
        this.pendingIr = null;
        if (p) this.swapIr(p);
      },
      CROSSFADE_S * 1000 + 15,
    );
  }

  // ---------- Controles ----------

  /** A = original, B = com IR (crossfade de ~20 ms). */
  setAB(ab: AB): void {
    const t = this.ctx.currentTime;
    for (const [g, on] of [
      [this.dryAB.gain, ab === 'A'],
      [this.wetAB.gain, ab === 'B'],
    ] as const) {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(on ? 1 : 0, t + CROSSFADE_S);
    }
  }

  /** Liga a compensação de volume: o caminho B é ajustado para ter o mesmo RMS do A. */
  setLoudnessMatch(on: boolean): void {
    if (this.matchTimer) clearInterval(this.matchTimer);
    this.matchTimer = null;
    const g = this.wetComp.gain;
    if (!on) {
      g.setTargetAtTime(1, this.ctx.currentTime, 0.05);
      return;
    }
    const a = new Float32Array(this.rmsIn.fftSize);
    const b = new Float32Array(this.rmsWet.fftSize);
    this.matchTimer = setInterval(() => {
      this.rmsIn.getFloatTimeDomainData(a);
      this.rmsWet.getFloatTimeDomainData(b);
      const comp = loudnessCompensation(rms(a), rms(b));
      // constante de tempo de 0,3 s: acompanha a música sem "bombear"
      if (comp !== null) g.setTargetAtTime(comp, this.ctx.currentTime, 0.3);
    }, 100);
  }

  setVolumeDb(db: number): void {
    this.volume.gain.setTargetAtTime(dbToLin(db), this.ctx.currentTime, 0.01);
  }

  /** Mudo instantâneo (sem rampa): usado pelo botão de pânico. */
  setMuted(muted: boolean): void {
    const g = this.muteGain.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setValueAtTime(muted ? 0 : 1, this.ctx.currentTime);
  }

  /** Quanto o limiter está reduzindo agora (dB, ≤ 0). */
  get limiterReductionDb(): number {
    return this.limiter.reduction;
  }

  latency(): { base: number | null; output: number | null } {
    return {
      base: this.ctx.baseLatency ?? null,
      output: typeof this.ctx.outputLatency === 'number' ? this.ctx.outputLatency : null,
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
    src.connect(this.input);
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
    picked.connect(this.input);
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
