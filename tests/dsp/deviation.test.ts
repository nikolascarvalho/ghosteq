import { describe, expect, it } from 'vitest';
import {
  buildIr,
  cascadeMagnitudeDb,
  compareCurves,
  designCascade,
  deviationAt,
  irMagnitudeDb,
  logFrequencies,
  type FilterSpec,
} from '../../src/dsp';

const FS = 48000;
const freqs = logFrequencies(512);

function curves(specs: FilterSpec[], length: number) {
  const sections = designCascade(specs, FS);
  const { ir } = buildIr(sections, { length });
  return { target: cascadeMagnitudeDb(sections, freqs, FS), real: irMagnitudeDb(ir, freqs, FS) };
}

describe('curva real × alvo', () => {
  it('corte em 3 kHz é preciso com 1024 amostras (< 1 dB)', () => {
    const { target, real } = curves([{ type: 'peak', freq: 3000, gainDb: -5, q: 1.4 }], 1024);
    const r = compareCurves(freqs, target, real);
    expect(r.maxAbsDb).toBeLessThan(1);
    expect(r.regions).toHaveLength(0);
  });

  it('corte estreito em 40 Hz fica impreciso com 1024 amostras (> 3 dB no grave)', () => {
    const { target, real } = curves([{ type: 'peak', freq: 40, gainDb: -10, q: 4 }], 1024);
    const r = compareCurves(freqs, target, real);
    expect(r.regions.length).toBeGreaterThan(0);
    expect(r.freqAtMax).toBeLessThan(150);
    expect(Math.abs(deviationAt(freqs, target, real, 40))).toBeGreaterThan(3);
  });

  it('o mesmo corte em 40 Hz melhora com 2048 amostras (Helix)', () => {
    const spec: FilterSpec[] = [{ type: 'peak', freq: 40, gainDb: -10, q: 4 }];
    const a = curves(spec, 1024);
    const b = curves(spec, 2048);
    expect(Math.abs(deviationAt(freqs, b.target, b.real, 40))).toBeLessThan(
      Math.abs(deviationAt(freqs, a.target, a.real, 40)),
    );
  });

  it('piso evita alarme no fundo de um HPF', () => {
    const target = [-60, -40, 0];
    const real = [-45, -30, 0];
    expect(compareCurves([20, 40, 1000], target, real, { floorDb: -24 }).maxAbsDb).toBe(0);
  });
});
