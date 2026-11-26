// Teste de integração: simula o que o modeler faz (convolver áudio com o IR)
// e verifica, só olhando entrada e saída, que a curva aplicada é a esperada.
import { describe, expect, it } from 'vitest';
import {
  buildIr,
  cascadeMagnitudeDb,
  designCascade,
  fftConvolve,
  irMagnitudeDb,
  realFft,
  type FilterSpec,
} from '../../src/dsp';
import { whiteNoise } from '../helpers';

const FS = 48000;
const SEG = 8192;

/** Estimativa de H(f) = Sxy / Sxx (método de Welch, janela de Hann, 50% de sobreposição). */
function estimateTransferDb(x: Float64Array, y: Float64Array): Float64Array {
  const half = SEG / 2;
  const sxyRe = new Float64Array(half + 1);
  const sxyIm = new Float64Array(half + 1);
  const sxx = new Float64Array(half + 1);
  const win = Float64Array.from({ length: SEG }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / SEG));
  for (let start = 0; start + SEG <= x.length; start += SEG / 2) {
    const xs = new Float64Array(SEG);
    const ys = new Float64Array(SEG);
    for (let i = 0; i < SEG; i++) {
      xs[i] = x[start + i]! * win[i]!;
      ys[i] = y[start + i]! * win[i]!;
    }
    const X = realFft(xs, SEG);
    const Y = realFft(ys, SEG);
    for (let k = 0; k <= half; k++) {
      // conj(X)·Y
      sxyRe[k]! += X.re[k]! * Y.re[k]! + X.im[k]! * Y.im[k]!;
      sxyIm[k]! += X.re[k]! * Y.im[k]! - X.im[k]! * Y.re[k]!;
      sxx[k]! += X.re[k]! * X.re[k]! + X.im[k]! * X.im[k]!;
    }
  }
  const out = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++) out[k] = 20 * Math.log10(Math.hypot(sxyRe[k]!, sxyIm[k]!) / sxx[k]!);
  return out;
}

describe('integração: ruído branco ⊛ IR', () => {
  it('reproduz a curva real do IR e a curva-alvo nos médios/agudos', () => {
    const specs: FilterSpec[] = [
      { type: 'hpf12', freq: 80, gainDb: 0, q: Math.SQRT1_2 },
      { type: 'peak', freq: 3000, gainDb: -5, q: 1.4 },
      { type: 'highshelf', freq: 5000, gainDb: 3, q: 0.707 },
    ];
    const sections = designCascade(specs, FS);
    const gainDb = 3;
    const { ir } = buildIr(sections, { length: 1024, gainDb });

    const x = whiteNoise(1 << 18, 42);
    const y = fftConvolve(x, ir).subarray(0, x.length);
    const H = estimateTransferDb(x, y);

    const bins: number[] = [];
    const freqs: number[] = [];
    for (let k = 1; k <= SEG / 2; k++) {
      const f = (k * FS) / SEG;
      if (f >= 100 && f <= 16000) {
        bins.push(k);
        freqs.push(f);
      }
    }
    const real = irMagnitudeDb(ir, freqs, FS, SEG);
    const target = cascadeMagnitudeDb(sections, freqs, FS, gainDb);

    bins.forEach((k, i) => {
      // O áudio processado tem exatamente a curva REAL do IR truncado…
      expect(Math.abs(H[k]! - real[i]!)).toBeLessThan(0.5);
      // …e, de 300 Hz para cima, ela coincide com a curva pedida.
      if (freqs[i]! >= 300) expect(Math.abs(H[k]! - target[i]!)).toBeLessThan(1);
    });
  });
});
