import { describe, expect, it } from 'vitest';
import {
  cascadeMagnitudeDb,
  designCascade,
  impulseResponse,
  irMagnitudeDb,
  logFrequencies,
  resample,
  resampleIr,
} from '../../src/dsp';

describe('resample', () => {
  it('IR de 44,1 kHz levado a 48 kHz preserva a curva (±0,2 dB até 16 kHz)', () => {
    const sections = designCascade(
      [
        { type: 'lowshelf', freq: 200, gainDb: -4, q: 0.707 },
        { type: 'peak', freq: 3000, gainDb: 6, q: 1 },
        { type: 'highshelf', freq: 8000, gainDb: 3, q: 0.707 },
      ],
      44100,
    );
    const ir44 = impulseResponse(sections, 4096);
    const ir48 = resampleIr(ir44, 44100, 48000);
    const freqs = logFrequencies(200, 30, 16000);
    const expected = cascadeMagnitudeDb(sections, freqs, 44100); // curva original
    const measured = irMagnitudeDb(ir48, freqs, 48000, 65536);
    for (let i = 0; i < freqs.length; i++) {
      expect(Math.abs(measured[i]! - expected[i]!)).toBeLessThan(0.2);
    }
  });

  it('IR que começa na amostra 0 não perde energia (ringing preservado nas duas pontas)', () => {
    // Regressão: sem keepRinging, um Dirac em 0 perdia ~9% do ganho DC.
    const sum = resampleIr([1, 0, 0, 0], 44100, 48000).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 4);
  });

  it('comprimento escala com a razão das taxas', () => {
    expect(resample(new Float64Array(44100), 44100, 48000)).toHaveLength(48000);
    expect(resample(new Float64Array(96000), 96000, 48000)).toHaveLength(48000);
  });

  it('senoide de 1 kHz mantém a amplitude após 96 → 48 kHz', () => {
    const n = 9600;
    const x = Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 1000 * i) / 96000));
    const y = resample(x, 96000, 48000);
    let peak = 0;
    for (let i = 500; i < y.length - 500; i++) peak = Math.max(peak, Math.abs(y[i]!));
    expect(peak).toBeCloseTo(1, 2);
  });

  it('mesma taxa devolve cópia idêntica', () => {
    const x = [0.1, -0.2, 0.3];
    expect(Array.from(resample(x, 48000, 48000))).toEqual(x);
  });
});
