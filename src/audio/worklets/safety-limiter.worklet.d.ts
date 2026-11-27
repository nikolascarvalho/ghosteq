// Tipos do núcleo puro do limiter (o arquivo .js roda também como AudioWorklet).
export interface LimiterOptions {
  thresholdDb?: number;
  ceilingDb?: number;
  releaseMs?: number;
}

export declare const LIMITER_DEFAULTS: Readonly<Required<LimiterOptions>>;

export declare class PeakLimiterCore {
  constructor(sampleRate: number, options?: LimiterOptions);
  readonly threshold: number;
  readonly ceiling: number;
  gain: number;
  process(input: Float32Array[], output: Float32Array[], frames: number): void;
  takeMinGain(): number;
}
