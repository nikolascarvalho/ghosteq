import { describe, expect, it } from 'vitest';
import { convolve, fft, fftConvolve } from '../../src/dsp';
import { maxAbsDiff, whiteNoise } from '../helpers';

describe('FFT', () => {
  it('bate com a DFT ingênua', () => {
    const n = 64;
    const x = whiteNoise(n, 7);
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    fft(re, im);
    for (let k = 0; k < n; k++) {
      let sr = 0;
      let si = 0;
      for (let t = 0; t < n; t++) {
        sr += x[t]! * Math.cos((-2 * Math.PI * k * t) / n);
        si += x[t]! * Math.sin((-2 * Math.PI * k * t) / n);
      }
      expect(re[k]).toBeCloseTo(sr, 9);
      expect(im[k]).toBeCloseTo(si, 9);
    }
  });

  it('ida e volta devolve o sinal original', () => {
    const x = whiteNoise(1024, 3);
    const re = Float64Array.from(x);
    const im = new Float64Array(1024);
    fft(re, im);
    fft(re, im, true);
    expect(maxAbsDiff(re, x)).toBeLessThan(1e-12);
  });

  it('rejeita tamanho que não é potência de 2', () => {
    expect(() => fft(new Float64Array(100), new Float64Array(100))).toThrow();
  });
});

describe('convolução', () => {
  it('direta e via FFT dão o mesmo resultado', () => {
    const x = whiteNoise(3000, 1);
    const h = whiteNoise(257, 2);
    expect(maxAbsDiff(convolve(x, h), fftConvolve(x, h))).toBeLessThan(1e-10);
  });

  it('convoluir com Dirac não altera o sinal', () => {
    const x = whiteNoise(500, 5);
    const y = convolve(x, [1]);
    expect(maxAbsDiff(x, y)).toBe(0);
  });
});
