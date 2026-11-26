// Compara curva alvo × curva real e aponta onde elas divergem.
// É o "teste de qualidade" do IR: com 1024 amostras o grave perde precisão.

export interface DeviationRegion {
  fLow: number;
  fHigh: number;
  /** Desvio de maior módulo na região (real − alvo), em dB. */
  worstDb: number;
  freqAtWorst: number;
}

export interface DeviationReport {
  /** Maior |real − alvo| em toda a faixa. */
  maxAbsDb: number;
  freqAtMax: number;
  /** Trechos contíguos em que |real − alvo| > limiar. */
  regions: DeviationRegion[];
}

export interface CompareOptions {
  /** Limiar de aviso em dB (padrão 1 dB). */
  thresholdDb?: number;
  /**
   * Piso em dB: abaixo disso as duas curvas são "achatadas" antes de comparar.
   * Evita alarmes em zonas já muito atenuadas (ex.: fundo de um HPF a -50 dB).
   */
  floorDb?: number;
}

export function compareCurves(
  freqs: ArrayLike<number>,
  target: ArrayLike<number>,
  real: ArrayLike<number>,
  opts: CompareOptions = {},
): DeviationReport {
  const threshold = opts.thresholdDb ?? 1;
  const floor = opts.floorDb ?? -24;
  let maxAbsDb = 0;
  let freqAtMax = freqs[0] ?? 0;
  const regions: DeviationRegion[] = [];
  let current: DeviationRegion | null = null;

  for (let i = 0; i < freqs.length; i++) {
    const d = Math.max(real[i]!, floor) - Math.max(target[i]!, floor);
    const f = freqs[i]!;
    if (Math.abs(d) > maxAbsDb) {
      maxAbsDb = Math.abs(d);
      freqAtMax = f;
    }
    if (Math.abs(d) > threshold) {
      if (!current) {
        current = { fLow: f, fHigh: f, worstDb: d, freqAtWorst: f };
        regions.push(current);
      }
      current.fHigh = f;
      if (Math.abs(d) > Math.abs(current.worstDb)) {
        current.worstDb = d;
        current.freqAtWorst = f;
      }
    } else {
      current = null;
    }
  }
  return { maxAbsDb, freqAtMax, regions };
}

/** Desvio (real − alvo) interpolado numa frequência qualquer (ex.: centro de uma banda). */
export function deviationAt(
  freqs: ArrayLike<number>,
  target: ArrayLike<number>,
  real: ArrayLike<number>,
  f: number,
): number {
  const n = freqs.length;
  if (n === 0) return 0;
  if (f <= freqs[0]!) return real[0]! - target[0]!;
  if (f >= freqs[n - 1]!) return real[n - 1]! - target[n - 1]!;
  let i = 1;
  while (freqs[i]! < f) i++;
  const f0 = freqs[i - 1]!;
  const f1 = freqs[i]!;
  const t = Math.log(f / f0) / Math.log(f1 / f0);
  const d0 = real[i - 1]! - target[i - 1]!;
  const d1 = real[i]! - target[i]!;
  return d0 + (d1 - d0) * t;
}
