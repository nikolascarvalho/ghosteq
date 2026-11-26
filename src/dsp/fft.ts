// FFT radix-2 iterativa (Cooley–Tukey), in-place, Float64.
// Transforma um sinal no tempo no seu espectro (quanto de cada frequência ele tem).

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** FFT in-place. `re`/`im` precisam ter o mesmo tamanho, potência de 2. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) throw new Error('fft: tamanho precisa ser potência de 2');

  // Reordenação bit-reversa
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }

  const sign = inverse ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const ang = (sign * 2 * Math.PI) / size;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let start = 0; start < n; start += size) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = start + k;
        const b = a + half;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a]! += tr;
        im[a]! += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i]! /= n;
      im[i]! /= n;
    }
  }
}

/** FFT de um sinal real com zero-padding até `size`. Devolve as partes re/im completas. */
export function realFft(signal: ArrayLike<number>, size: number): { re: Float64Array; im: Float64Array } {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const n = Math.min(size, signal.length);
  for (let i = 0; i < n; i++) re[i] = signal[i]!;
  fft(re, im);
  return { re, im };
}
