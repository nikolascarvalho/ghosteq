import { fft, nextPow2 } from './fft';

/**
 * Convolução linear direta: y = x * h. Custo O(N·M); ótima para IRs curtos
 * (ex.: IR de caixa × IR de EQ, ambos ~1024 amostras).
 * `outLength` permite já cortar o resultado.
 */
export function convolve(x: ArrayLike<number>, h: ArrayLike<number>, outLength?: number): Float64Array {
  const full = x.length + h.length - 1;
  const len = outLength ?? full;
  const y = new Float64Array(len);
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!;
    if (xi === 0) continue;
    const jMax = Math.min(h.length, len - i);
    for (let j = 0; j < jMax; j++) y[i + j]! += xi * h[j]!;
  }
  return y;
}

/** Convolução via FFT: O(N log N). Para sinais longos (ex.: segundos de áudio). */
export function fftConvolve(x: ArrayLike<number>, h: ArrayLike<number>): Float64Array {
  const full = x.length + h.length - 1;
  const n = nextPow2(full);
  const xr = new Float64Array(n);
  const xi = new Float64Array(n);
  const hr = new Float64Array(n);
  const hi = new Float64Array(n);
  for (let i = 0; i < x.length; i++) xr[i] = x[i]!;
  for (let i = 0; i < h.length; i++) hr[i] = h[i]!;
  fft(xr, xi);
  fft(hr, hi);
  for (let k = 0; k < n; k++) {
    const r = xr[k]! * hr[k]! - xi[k]! * hi[k]!;
    const i = xr[k]! * hi[k]! + xi[k]! * hr[k]!;
    xr[k] = r;
    xi[k] = i;
  }
  fft(xr, xi, true);
  return xr.slice(0, full);
}
