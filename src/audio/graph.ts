// O "caminho do som" do modo Ouvir, montado em qualquer contexto de áudio
// (o de tempo real ou um OfflineAudioContext, que renderiza mais rápido que o
// tempo real e serve para MEDIR o grafo com um impulso).
//
//   entrada (mono) ─┬─ A: original ─────────────────────────────┐
//                   └─ B: 2 convolvers (troca de IR) → compensação ┤
//                                                                 ↓
//                    mix → volume → limiter (worklet) → mudo → saída
//
// Só ficam EM SÉRIE nós sem buffer próprio (ganhos, convolver, worklet).
// Analisadores e medidores de RMS são ramificações paralelas: leem o sinal,
// mas o som não passa por eles, então não podem atrasar nada.
import limiterUrl from './worklets/safety-limiter.worklet.js?url';
import { CROSSFADE_S, OUTPUT_CEILING_DB, START_VOLUME_DB, dbToLin, hardClipCurve } from './helpers';

export type AB = 'A' | 'B';
export const LIMITER_NAME = 'ghosteq-safety-limiter';

/** Carrega o worklet do limiter no contexto. false = navegador sem AudioWorklet. */
export async function loadLimiter(ctx: BaseAudioContext): Promise<boolean> {
  try {
    if (!ctx.audioWorklet) return false;
    await ctx.audioWorklet.addModule(limiterUrl);
    return true;
  } catch (err) {
    console.warn('AudioWorklet do limiter indisponível; usando só o hard clip', err);
    return false;
  }
}

export interface GraphOptions {
  /** true se `loadLimiter` deu certo neste contexto. */
  worklet: boolean;
  volumeDb?: number;
  ab?: AB;
}

export class MonitorGraph {
  readonly input: GainNode;
  readonly analyserBefore: AnalyserNode;
  readonly analyserAfter: AnalyserNode;
  readonly rmsIn: AnalyserNode;
  readonly rmsWet: AnalyserNode;
  readonly wetComp: GainNode;
  /** "worklet" = limiter sem lookahead; "clip" = fallback só com hard clip. */
  readonly limiterKind: 'worklet' | 'clip';

  private dryAB: GainNode;
  private wetAB: GainNode;
  private convs: [ConvolverNode, ConvolverNode];
  private convGains: [GainNode, GainNode];
  private active = 0;
  private hasIr = false;
  private swapping = false;
  private pendingIr: AudioBuffer | null = null;
  private volume: GainNode;
  private muteGain: GainNode;
  private minGain = 1;

  constructor(
    readonly ctx: BaseAudioContext,
    opts: GraphOptions,
  ) {
    const c = ctx;
    const ab = opts.ab ?? 'B';
    // Entrada forçada a mono: qualquer fonte estéreo é somada aqui.
    this.input = new GainNode(c, {
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    this.dryAB = new GainNode(c, { gain: ab === 'A' ? 1 : 0 });
    this.wetAB = new GainNode(c, { gain: ab === 'B' ? 1 : 0 });
    this.wetComp = new GainNode(c, { gain: 1 });
    // normalize = false ANTES de receber o buffer: o IR toca com o ganho real (ex.: +9 dB).
    this.convs = [
      new ConvolverNode(c, { disableNormalization: true }),
      new ConvolverNode(c, { disableNormalization: true }),
    ];
    this.convGains = [new GainNode(c, { gain: 1 }), new GainNode(c, { gain: 0 })];
    const wetSum = new GainNode(c);
    const mix = new GainNode(c);
    this.volume = new GainNode(c, { gain: dbToLin(opts.volumeDb ?? START_VOLUME_DB) });
    this.muteGain = new GainNode(c, { gain: 1 });

    // Proteção: limiter de pico por amostra (attack 0, release 50 ms) + hard clip
    // em −1 dBFS dentro do mesmo worklet. Zero amostras de atraso.
    let safety: AudioNode;
    if (opts.worklet) {
      const node = new AudioWorkletNode(c, LIMITER_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
        processorOptions: { thresholdDb: OUTPUT_CEILING_DB, ceilingDb: OUTPUT_CEILING_DB, releaseMs: 50 },
      });
      node.port.onmessage = (e: MessageEvent<number>) => {
        this.minGain = e.data;
      };
      safety = node;
      this.limiterKind = 'worklet';
    } else {
      // Sem AudioWorklet: só o hard clip, SEM oversample (oversample adiciona atraso).
      safety = new WaveShaperNode(c, { curve: hardClipCurve(), oversample: 'none' });
      this.limiterKind = 'clip';
    }

    // Caminho A (original)
    this.input.connect(this.dryAB).connect(mix);
    // Caminho B (com IR)
    for (let i = 0; i < 2; i++)
      this.input.connect(this.convs[i]!).connect(this.convGains[i]!).connect(wetSum);
    wetSum.connect(this.wetComp).connect(this.wetAB).connect(mix);
    // Saída protegida. O volume vem ANTES da proteção: nenhum ajuste de volume
    // consegue passar do teto.
    mix.connect(this.volume).connect(safety).connect(this.muteGain).connect(c.destination);

    // Medições: ramificações paralelas (fora do caminho do som).
    this.analyserBefore = new AnalyserNode(c, { fftSize: 8192, smoothingTimeConstant: 0.8 });
    this.analyserAfter = new AnalyserNode(c, { fftSize: 8192, smoothingTimeConstant: 0.8 });
    this.rmsIn = new AnalyserNode(c, { fftSize: 4096 });
    this.rmsWet = new AnalyserNode(c, { fftSize: 4096 });
    this.input.connect(this.analyserBefore);
    this.input.connect(this.rmsIn);
    wetSum.connect(this.rmsWet);
    this.wetComp.connect(this.analyserAfter);
  }

  // ---------- IR ----------

  setIrBuffer(buf: AudioBuffer): void {
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
        if (p) this.setIrBuffer(p);
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

  setVolumeDb(db: number): void {
    this.volume.gain.setTargetAtTime(dbToLin(db), this.ctx.currentTime, 0.01);
  }

  /** Mudo instantâneo (sem rampa): usado pelo botão de pânico. */
  setMuted(muted: boolean): void {
    const g = this.muteGain.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setValueAtTime(muted ? 0 : 1, this.ctx.currentTime);
  }

  /** Maior redução do limiter nos últimos ~50 ms (dB, ≤ 0). null sem worklet. */
  get reductionDb(): number | null {
    if (this.limiterKind !== 'worklet') return null;
    return this.minGain > 0 ? 20 * Math.log10(this.minGain) : -Infinity;
  }
}

// ---------- Medição do atraso do grafo com impulso ----------

export interface GraphDelay {
  /** Atraso em amostras do caminho A (original) e B (convolver com IR Dirac). */
  dry: number;
  wet: number;
  /** Ganho de pico medido (dB) — 0 dB prova que nada no caminho muda o nível. */
  dryGainDb: number;
  wetGainDb: number;
  limiterKind: 'worklet' | 'clip';
}

/**
 * Mede quantas amostras o grafo atrasa o som: num OfflineAudioContext, monta o
 * MESMO grafo (inclusive splitter + ganho do caminho ao vivo e o limiter),
 * manda um impulso na posição `at` e procura onde ele sai. O convolver recebe
 * um IR "Dirac" (1, 0, 0, …) do tamanho do aparelho: se sair deslocado, é
 * atraso do nó, não do IR.
 */
export async function measureGraphDelay(irLength = 1024, sampleRate = 48000): Promise<GraphDelay> {
  const at = 1000;
  const frames = 8192;
  const once = async (ab: AB) => {
    const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: frames, sampleRate });
    const worklet = await loadLimiter(ctx);
    const g = new MonitorGraph(ctx, { worklet, volumeDb: 0, ab });
    const dirac = new AudioBuffer({ numberOfChannels: 1, length: irLength, sampleRate });
    dirac.getChannelData(0)[0] = 1;
    g.setIrBuffer(dirac);
    const imp = new AudioBuffer({ numberOfChannels: 1, length: frames, sampleRate });
    imp.getChannelData(0)[at] = 0.5;
    const src = new AudioBufferSourceNode(ctx, { buffer: imp });
    // Mesmo caminho da entrada ao vivo: splitter → ganho de seleção → entrada.
    const splitter = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    const picked = new GainNode(ctx, { gain: 1 });
    src.connect(splitter);
    splitter.connect(picked, 0);
    picked.connect(g.input);
    src.start(0);
    const out = (await ctx.startRendering()).getChannelData(0);
    let k = 0;
    for (let i = 1; i < out.length; i++) if (Math.abs(out[i]!) > Math.abs(out[k]!)) k = i;
    return { delay: k - at, gainDb: 20 * Math.log10(Math.abs(out[k]!) / 0.5), kind: g.limiterKind };
  };
  const a = await once('A');
  const b = await once('B');
  return { dry: a.delay, wet: b.delay, dryGainDb: a.gainDb, wetGainDb: b.gainDb, limiterKind: b.kind };
}
