export const dbToGain = (db: number): number => Math.pow(10, db / 20);

export const gainToDb = (g: number): number => (g > 0 ? 20 * Math.log10(g) : -Infinity);

/** Maior valor absoluto do sinal. */
export function peakAbs(x: ArrayLike<number>): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]!);
    if (v > p) p = v;
  }
  return p;
}

/**
 * PCM inteiro só representa amostras em [-1, 1). Acima disso estoura (clipa),
 * então o IR precisa ser salvo em 32-bit float.
 */
export function requiresFloat(peak: number): boolean {
  return peak > 1;
}
