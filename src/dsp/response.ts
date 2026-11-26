// Curvas de resposta em frequência:
//  - "alvo": calculada analiticamente a partir dos biquads (o que o usuário pediu);
//  - "real": medida pela FFT do IR truncado (o que o aparelho vai de fato fazer).
import { biquadMagnitudeSquared } from './biquad';
import { nextPow2, realFft } from './fft';
import type { Biquad } from './types';

/** `n` frequências espaçadas em escala log entre fMin e fMax (como no gráfico). */
export function logFrequencies(n: number, fMin = 20, fMax = 20000): Float64Array {
  const out = new Float64Array(n);
  const ratio = Math.log(fMax / fMin);
  for (let i = 0; i < n; i++) out[i] = fMin * Math.exp((ratio * i) / (n - 1));
  return out;
}

/** Magnitude analítica (dB) da cascata + ganho, nas frequências pedidas. */
export function cascadeMagnitudeDb(
  sections: readonly Biquad[],
  freqs: ArrayLike<number>,
  fs: number,
  gainDb = 0,
): Float64Array {
  const out = new Float64Array(freqs.length);
  for (let i = 0; i < freqs.length; i++) {
    let mag2 = 1;
    for (const s of sections) mag2 *= biquadMagnitudeSquared(s, freqs[i]!, fs);
    out[i] = 10 * Math.log10(Math.max(mag2, 1e-30)) + gainDb;
  }
  return out;
}

/** Magnitude (dB) em todos os bins 0..N/2 de uma FFT de tamanho N. */
export function spectrumDb(signal: ArrayLike<number>, size: number): Float64Array {
  const { re, im } = realFft(signal, size);
  const half = size / 2;
  const out = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++) {
    out[k] = 10 * Math.log10(Math.max(re[k]! * re[k]! + im[k]! * im[k]!, 1e-30));
  }
  return out;
}

/**
 * Magnitude (dB) do IR nas frequências pedidas, via FFT com zero-padding
 * (padding = mais pontos no espectro, só "interpola" a curva; não cria resolução).
 * Entre bins, interpola linearmente a magnitude.
 */
export function irMagnitudeDb(
  ir: ArrayLike<number>,
  freqs: ArrayLike<number>,
  fs: number,
  size?: number,
): Float64Array {
  const n = size ?? Math.max(16384, nextPow2(ir.length) * 4);
  const { re, im } = realFft(ir, n);
  const half = n / 2;
  const mag = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++) mag[k] = Math.hypot(re[k]!, im[k]!);
  const out = new Float64Array(freqs.length);
  for (let i = 0; i < freqs.length; i++) {
    const pos = Math.min((freqs[i]! / fs) * n, half);
    const k0 = Math.floor(pos);
    const k1 = Math.min(k0 + 1, half);
    const t = pos - k0;
    const m = mag[k0]! * (1 - t) + mag[k1]! * t;
    out[i] = 20 * Math.log10(Math.max(m, 1e-15));
  }
  return out;
}

/**
 * Magnitude (dB) suavizada em fração de oitava (padrão 1/12): em cada
 * frequência, média da POTÊNCIA dos bins dentro da janela [f·2^(−k/2), f·2^(k/2)].
 * Usada para IRs de caixa, cujo espectro é cheio de picos e vales estreitos que
 * o ouvido não percebe individualmente (e que poluiriam o gráfico e os avisos).
 */
export function smoothedMagnitudeDb(
  ir: ArrayLike<number>,
  freqs: ArrayLike<number>,
  fs: number,
  fraction = 1 / 12,
  size?: number,
): Float64Array {
  const n = size ?? Math.max(16384, nextPow2(ir.length) * 4);
  const { re, im } = realFft(ir, n);
  const half = n / 2;
  // Soma acumulada da potência: média de qualquer faixa em O(1).
  const cum = new Float64Array(half + 2);
  for (let k = 0; k <= half; k++) cum[k + 1] = cum[k]! + re[k]! * re[k]! + im[k]! * im[k]!;
  const binHz = fs / n;
  const w = Math.pow(2, fraction / 2);
  const out = new Float64Array(freqs.length);
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i]!;
    const lo = f / w / binHz;
    const hi = (f * w) / binHz;
    let power: number;
    if (hi - lo < 2) {
      // Janela menor que ~2 bins (grave): interpola entre os bins vizinhos em
      // vez de "arredondar" para um só (o que desenharia uma escada no gráfico).
      const pos = Math.min(f / binHz, half);
      const k = Math.min(Math.floor(pos), half - 1);
      const t = pos - k;
      const p0 = cum[k + 1]! - cum[k]!;
      const p1 = cum[k + 2]! - cum[k + 1]!;
      power = p0 * (1 - t) + p1 * t;
    } else {
      const k0 = Math.max(0, Math.round(lo));
      const k1 = Math.min(half, Math.round(hi));
      power = (cum[k1 + 1]! - cum[k0]!) / (k1 - k0 + 1);
    }
    out[i] = 10 * Math.log10(Math.max(power, 1e-30));
  }
  return out;
}
