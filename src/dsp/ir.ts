// Geração do IR: um "impulso unitário" (1, 0, 0, …) passado pela cascata de
// biquads. O que sai é exatamente a resposta ao impulso do EQ — e, como biquads
// são filtros de fase mínima, o IR começa na amostra 0 (sem latência).
import { filterCascade } from './cascade';
import { dbToGain, peakAbs } from './gain';
import type { Biquad, IrResult } from './types';

export const DEFAULT_FADE_LENGTH = 64;
export const DEFAULT_REFERENCE_LENGTH = 16384;

export function impulseResponse(sections: readonly Biquad[], length: number, gainDb = 0): Float64Array {
  const impulse = new Float64Array(length);
  impulse[0] = dbToGain(gainDb);
  return filterCascade(sections, impulse);
}

/**
 * Corta o IR em `length` amostras e aplica meia janela de Hann nas últimas
 * `fadeLength` amostras, para o final descer suavemente até 0 (sem "degrau",
 * que viraria um clique/ripple no espectro). A última amostra fica exatamente 0.
 */
export function truncateWithFade(
  ir: ArrayLike<number>,
  length: number,
  fadeLength = DEFAULT_FADE_LENGTH,
): Float64Array {
  const out = new Float64Array(length);
  const n = Math.min(length, ir.length);
  for (let i = 0; i < n; i++) out[i] = ir[i]!;
  const fade = Math.min(fadeLength, length);
  const start = length - fade;
  for (let k = 0; k < fade; k++) {
    // k = 0 -> quase 1 ; k = fade-1 -> 0
    out[start + k]! *= 0.5 * (1 + Math.cos((Math.PI * (k + 1)) / fade));
  }
  return out;
}

export interface BuildIrOptions {
  /** Tamanho final (do aparelho), ex.: 1024 no Nano Cortex. */
  length: number;
  /** Ganho de saída em dB. */
  gainDb?: number;
  fadeLength?: number;
  /** Tamanho do IR "longo" de referência (sem truncar). */
  referenceLength?: number;
}

/** Pipeline completo: biquads -> IR longo -> IR truncado com fade + pico. */
export function buildIr(sections: readonly Biquad[], opts: BuildIrOptions): IrResult {
  const { length, gainDb = 0, fadeLength = DEFAULT_FADE_LENGTH } = opts;
  const refLen = Math.max(opts.referenceLength ?? DEFAULT_REFERENCE_LENGTH, length);
  const irLong = impulseResponse(sections, refLen, gainDb);
  const ir = truncateWithFade(irLong, length, fadeLength);
  return { ir, irLong, peak: peakAbs(ir) };
}
