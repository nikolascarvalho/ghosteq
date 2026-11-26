import type { Biquad } from './types';

/**
 * Passa um sinal por uma cascata de biquads (Transposed Direct Form II, Float64).
 * Analogia: é um pipeline de transformações aplicadas em sequência,
 * em que cada etapa guarda um pequeno "estado" (as duas últimas amostras).
 */
export function filterCascade(sections: readonly Biquad[], input: ArrayLike<number>): Float64Array {
  const out = Float64Array.from(input);
  for (const s of sections) {
    let z1 = 0;
    let z2 = 0;
    for (let n = 0; n < out.length; n++) {
      const x = out[n]!;
      const y = s.b0 * x + z1;
      z1 = s.b1 * x - s.a1 * y + z2;
      z2 = s.b2 * x - s.a2 * y;
      out[n] = y;
    }
  }
  return out;
}
