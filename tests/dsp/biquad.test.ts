import { describe, expect, it } from 'vitest';
import { cascadeMagnitudeDb, designFilter, type FilterSpec } from '../../src/dsp';

const FS = 48000;
const magAt = (spec: FilterSpec, f: number) => cascadeMagnitudeDb(designFilter(spec, FS), [f], FS)[0]!;

describe('biquads RBJ', () => {
  it('peak: ganho exato na frequência central, 0 dB longe dela', () => {
    const spec: FilterSpec = { type: 'peak', freq: 3000, gainDb: -5, q: 1.4 };
    expect(magAt(spec, 3000)).toBeCloseTo(-5, 6);
    expect(Math.abs(magAt(spec, 50))).toBeLessThan(0.05);
  });

  it('low shelf: +ganho no grave, 0 dB no agudo', () => {
    const spec: FilterSpec = { type: 'lowshelf', freq: 200, gainDb: 6, q: 0.707 };
    expect(magAt(spec, 10)).toBeCloseTo(6, 1);
    expect(Math.abs(magAt(spec, 10000))).toBeLessThan(0.05);
    expect(magAt(spec, 200)).toBeCloseTo(3, 1); // metade do ganho em dB na frequência de canto
  });

  it('high shelf: +ganho no agudo, 0 dB no grave', () => {
    const spec: FilterSpec = { type: 'highshelf', freq: 4000, gainDb: -4, q: 0.707 };
    expect(magAt(spec, 20000)).toBeCloseTo(-4, 1);
    expect(Math.abs(magAt(spec, 50))).toBeLessThan(0.05);
  });

  it('HPF 12 dB Butterworth: -3,01 dB no corte, ~-12 dB uma oitava abaixo', () => {
    const spec: FilterSpec = { type: 'hpf12', freq: 100, gainDb: 0, q: Math.SQRT1_2 };
    expect(magAt(spec, 100)).toBeCloseTo(-3.01, 1);
    expect(magAt(spec, 50)).toBeCloseTo(-12.3, 0);
  });

  it('HPF/LPF 24 dB: duas seções, -3 dB no corte e ~-24 dB uma oitava além', () => {
    const hp = designFilter({ type: 'hpf24', freq: 100, gainDb: 0, q: Math.SQRT1_2 }, FS);
    expect(hp).toHaveLength(2);
    expect(cascadeMagnitudeDb(hp, [100], FS)[0]).toBeCloseTo(-3.01, 1);
    expect(cascadeMagnitudeDb(hp, [50], FS)[0]).toBeCloseTo(-24.1, 0);
    const lp = designFilter({ type: 'lpf24', freq: 5000, gainDb: 0, q: Math.SQRT1_2 }, FS);
    expect(cascadeMagnitudeDb(lp, [5000], FS)[0]).toBeCloseTo(-3.01, 0);
  });

  it('notch: rejeição profunda no centro', () => {
    expect(magAt({ type: 'notch', freq: 1000, gainDb: 0, q: 8 }, 1000)).toBeLessThan(-60);
  });

  it('peak/shelf com 0 dB não geram seção', () => {
    expect(designFilter({ type: 'peak', freq: 1000, gainDb: 0, q: 1 }, FS)).toHaveLength(0);
  });
});
