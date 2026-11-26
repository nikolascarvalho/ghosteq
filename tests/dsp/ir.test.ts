import { describe, expect, it } from 'vitest';
import {
  buildIr,
  cascadeMagnitudeDb,
  designCascade,
  requiresFloat,
  spectrumDb,
  truncateWithFade,
  type FilterSpec,
} from '../../src/dsp';

const FS = 48000;

const SPECS: FilterSpec[] = [
  { type: 'hpf24', freq: 70, gainDb: 0, q: Math.SQRT1_2 },
  { type: 'lowshelf', freq: 120, gainDb: 6, q: 0.7 },
  { type: 'peak', freq: 3000, gainDb: -5, q: 1.4 },
  { type: 'notch', freq: 1000, gainDb: 0, q: 10 },
  { type: 'highshelf', freq: 6000, gainDb: -3, q: 0.707 },
  { type: 'lpf12', freq: 12000, gainDb: 0, q: Math.SQRT1_2 },
];

describe('geração do IR', () => {
  it('IR longo (sem truncar) reproduz a resposta analítica em ±0,1 dB', () => {
    const sections = designCascade(SPECS, FS);
    const N = 16384;
    const { irLong } = buildIr(sections, { length: 1024, referenceLength: N });
    const measured = spectrumDb(irLong, N);
    let checked = 0;
    for (let k = 1; k <= N / 2; k++) {
      const f = (k * FS) / N;
      if (f < 20 || f > 20000) continue;
      const expected = cascadeMagnitudeDb(sections, [f], FS)[0]!;
      if (expected < -60) continue; // fundo do notch/HPF: dB instável e irrelevante
      expect(Math.abs(measured[k]! - expected)).toBeLessThan(0.1);
      checked++;
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it('IR flat (sem bandas, 0 dB) é um Dirac perfeito', () => {
    const { ir, irLong, peak } = buildIr([], { length: 1024 });
    expect(ir[0]).toBe(1);
    expect(ir.slice(1).every((v) => v === 0)).toBe(true);
    expect(irLong[0]).toBe(1);
    expect(peak).toBe(1);
    expect(requiresFloat(peak)).toBe(false);
  });

  it('ganho de +9 dB gera pico ≈ 2,818 e exige float', () => {
    const { ir, peak } = buildIr([], { length: 1024, gainDb: 9 });
    expect(peak).toBeCloseTo(2.8184, 4);
    expect(ir[0]).toBeCloseTo(2.8184, 4);
    expect(requiresFloat(peak)).toBe(true);
  });

  it('truncamento + fade: tamanho certo, sem descontinuidade, última amostra = 0', () => {
    const sections = designCascade(SPECS, FS);
    const { ir, irLong } = buildIr(sections, { length: 1024, fadeLength: 64 });
    expect(ir).toHaveLength(1024);
    expect(ir[1023]).toBe(0);
    // Antes do fade, igual ao IR longo
    for (let i = 0; i < 1024 - 64; i++) expect(ir[i]).toBe(irLong[i]);
    // Dentro do fade, só pode diminuir em módulo
    for (let i = 1024 - 64; i < 1024; i++) expect(Math.abs(ir[i]!)).toBeLessThanOrEqual(Math.abs(irLong[i]!));
    // Sem degrau no fim: penúltima amostra já é minúscula perto do pico
    expect(Math.abs(ir[1022]!)).toBeLessThan(1e-3 * Math.abs(ir[0]!));
  });

  it('truncateWithFade completa com zeros quando o IR é mais curto', () => {
    const out = truncateWithFade([1, 0.5], 8, 2);
    expect(out).toHaveLength(8);
    expect(out[0]).toBe(1);
    expect(out[7]).toBe(0);
  });
});
