import { describe, expect, it } from 'vitest';
import {
  curvePath,
  dbToY,
  freqToSlider,
  freqToX,
  makeViewport,
  sliderToFreq,
  xToFreq,
  yToDb,
} from '../../src/ui/editor/scale';
import { formatDb, formatHz, formatQ, formatTickHz } from '../../src/ui/common/format';

const v = makeViewport(800, 400);

describe('escalas do gráfico', () => {
  it('frequência ↔ x é inversível e logarítmica', () => {
    for (const f of [20, 100, 1000, 6300, 20000]) expect(xToFreq(freqToX(f, v), v)).toBeCloseTo(f, 6);
    // Cada década ocupa a mesma largura
    const d1 = freqToX(200, v) - freqToX(20, v);
    const d2 = freqToX(2000, v) - freqToX(200, v);
    expect(d1).toBeCloseTo(d2, 6);
    expect(freqToX(20, v)).toBe(v.padL);
    expect(freqToX(20000, v)).toBeCloseTo(v.width - v.padR, 6);
  });

  it('dB ↔ y é inversível; 0 dB no meio; +18 em cima', () => {
    for (const db of [-18, -5.5, 0, 9, 18]) expect(yToDb(dbToY(db, v), v)).toBeCloseTo(db, 6);
    expect(dbToY(18, v)).toBe(v.padT);
    expect(dbToY(0, v)).toBeCloseTo((v.padT + v.height - v.padB) / 2, 6);
  });

  it('y fora do gráfico é limitado a ±18 dB; x fora a 20 Hz–20 kHz', () => {
    expect(yToDb(-1000, v)).toBe(18);
    expect(yToDb(5000, v)).toBe(-18);
    expect(xToFreq(-50, v)).toBe(20);
    expect(xToFreq(5000, v)).toBeCloseTo(20000, 6);
  });

  it('curvePath gera um M seguido de Ls e aplica o offset', () => {
    const p = curvePath([20, 1000, 20000], [9, 9, 9], v, 9);
    expect(p.startsWith('M')).toBe(true);
    expect(p.match(/L/g)).toHaveLength(2);
    const y0 = dbToY(0, v).toFixed(1);
    expect(p).toContain(` ${y0}L`);
  });

  it('slider logarítmico de frequência', () => {
    expect(sliderToFreq(0)).toBe(20);
    expect(sliderToFreq(1)).toBeCloseTo(20000, 6);
    expect(sliderToFreq(freqToSlider(3000))).toBeCloseTo(3000, 6);
  });
});

describe('formatação', () => {
  it('frequências, dB e Q', () => {
    expect(formatHz(80)).toBe('80 Hz');
    expect(formatHz(3000)).toBe('3.00 kHz');
    expect(formatHz(12500)).toBe('12.5 kHz');
    expect(formatTickHz(2000)).toBe('2k');
    expect(formatDb(5)).toBe('+5.0 dB');
    expect(formatDb(-4.25)).toBe('-4.3 dB');
    expect(formatDb(-0.01)).toBe('0.0 dB');
    expect(formatQ(0.7071)).toBe('0.71');
    expect(formatQ(12)).toBe('12.0');
  });
});
