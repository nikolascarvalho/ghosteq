import { describe, expect, it } from 'vitest';
import { cascadeMagnitudeDb, designCascade, logFrequencies, type FilterSpec } from '../../src/dsp';
import {
  GRAPHIC9_FREQS,
  GRAPHIC_LAYOUTS,
  compileGraphic,
  compileTilt,
  compileToneStack,
  defaultGraphicState,
  defaultToneStackState,
  fitGraphic,
  normalizeGraphicState,
  normalizeToneStackState,
  proportionalQ,
  type GraphicMode,
} from '../../src/dsp/modes';
import { mulberry32 } from '../helpers';

const FS = 48000;
const mag = (specs: FilterSpec[], freqs: ArrayLike<number>) =>
  cascadeMagnitudeDb(designCascade(specs, FS), freqs, FS);
const fine = logFrequencies(2000, 20, 20000);

describe('modo gráfico', () => {
  it('Graphic-9 usa as frequências do Nano Cortex', () => {
    expect(GRAPHIC9_FREQS).toEqual([65, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);
    const f = compileGraphic('graphic9', defaultGraphicState('graphic9'));
    expect(f).toHaveLength(9);
    expect(f.map((x) => x.id)).toEqual(GRAPHIC9_FREQS.map((_, i) => `graphic9-${i}`));
    expect(f.every((x) => x.type === 'peak' && x.gainDb === 0)).toBe(true);
  });

  it('10 e 31 bandas seguem as frequências ISO', () => {
    expect(GRAPHIC_LAYOUTS.graphic10.freqs).toHaveLength(10);
    expect(GRAPHIC_LAYOUTS.graphic10.freqs[0]).toBe(31.5);
    expect(GRAPHIC_LAYOUTS.graphic31.freqs).toHaveLength(31);
    expect(GRAPHIC_LAYOUTS.graphic31.freqs.at(-1)).toBe(20000);
  });

  it('Q proporcional: cresce com |ganho|', () => {
    const q = GRAPHIC_LAYOUTS.graphic10.baseQ;
    expect(proportionalQ(q, 12)).toBeGreaterThan(proportionalQ(q, 6));
    expect(proportionalQ(q, -6)).toBe(proportionalQ(q, 6));
    expect(proportionalQ(q, 3)).toBeGreaterThan(proportionalQ(q, 0));
  });

  it('dois sliders vizinhos em +6 dB não passam de ~+7,5 dB entre eles', () => {
    for (const mode of ['graphic9', 'graphic10', 'graphic31'] as GraphicMode[]) {
      const s = defaultGraphicState(mode);
      const mid = Math.floor(s.gainsDb.length / 2);
      s.gainsDb[mid] = 6;
      s.gainsDb[mid + 1] = 6;
      const curve = mag(compileGraphic(mode, s), fine);
      expect(Math.max(...curve)).toBeLessThanOrEqual(7.5);
    }
  });

  it('a curva no centro de cada banda bate com o slider (±0,5 dB), em ajustes aleatórios', () => {
    const rnd = mulberry32(7);
    for (const mode of ['graphic9', 'graphic10', 'graphic31'] as GraphicMode[]) {
      const { freqs } = GRAPHIC_LAYOUTS[mode];
      for (let trial = 0; trial < 5; trial++) {
        const s = defaultGraphicState(mode);
        s.gainsDb = freqs.map(() => Math.round((rnd() * 16 - 8) * 10) / 10);
        const atCenters = mag(compileGraphic(mode, s), freqs);
        freqs.forEach((f, i) => {
          // 20 kHz fica perto da Nyquist (24 kHz): o biquad se deforma lá.
          if (f > 16000) return;
          expect(Math.abs(atCenters[i]! - s.gainsDb[i]!)).toBeLessThan(0.5);
        });
      }
    }
  });

  it('slider zerado entre dois vizinhos levantados fica perto de 0 dB', () => {
    const s = defaultGraphicState('graphic10');
    s.gainsDb[4] = 9;
    s.gainsDb[6] = 9;
    expect(Math.abs(mag(compileGraphic('graphic10', s), [1000])[0]!)).toBeLessThan(0.5);
  });

  it('HPF/LPF do modo viram filtros de corte', () => {
    const s = {
      ...defaultGraphicState('graphic9'),
      hpf: { enabled: true, freq: 90 },
      lpf: { enabled: true, freq: 9000 },
    };
    const f = compileGraphic('graphic9', s);
    expect(f.find((x) => x.id === 'graphic9-hpf')).toMatchObject({ type: 'hpf12', freq: 90 });
    expect(f.find((x) => x.id === 'graphic9-lpf')).toMatchObject({ type: 'lpf12', freq: 9000 });
  });

  it('paramétrico → gráfico: aproxima uma curva suave nos centros', () => {
    const source: FilterSpec[] = [
      { type: 'lowshelf', freq: 200, gainDb: -4, q: 0.7 },
      { type: 'peak', freq: 2500, gainDb: 5, q: 0.9 },
      { type: 'hpf24', freq: 70, gainDb: 0, q: 0.707 },
    ];
    const fitted = fitGraphic('graphic10', source);
    expect(fitted.hpf).toEqual({ enabled: true, freq: 70 });
    const freqs = GRAPHIC_LAYOUTS.graphic10.freqs.filter((f) => f >= 63 && f <= 8000);
    const want = mag(
      source.filter((s) => s.type !== 'hpf24'),
      freqs,
    );
    const got = mag(
      compileGraphic('graphic10', { ...fitted, hpf: { ...fitted.hpf, enabled: false } }),
      freqs,
    );
    freqs.forEach((_, i) => expect(Math.abs(got[i]! - want[i]!)).toBeLessThan(1));
  });

  it('normalização limita valores e completa o que falta', () => {
    const s = normalizeGraphicState('graphic9', { gainsDb: [99, -99, 'x'] });
    expect(s.gainsDb).toHaveLength(9);
    expect(s.gainsDb.slice(0, 4)).toEqual([12, -12, 0, 0]);
    expect(s.hpf.enabled).toBe(false);
  });
});

describe('tone stack', () => {
  it('compila grave (shelf), médio (peak na freq escolhida), agudo (shelf) e presença (peak)', () => {
    const s = { ...defaultToneStackState(), bassDb: 6, midDb: -4, midFreq: 600, trebleDb: 3, presenceDb: 2 };
    const f = compileToneStack(s);
    expect(f.map((x) => [x.id, x.type])).toEqual([
      ['ts-bass', 'lowshelf'],
      ['ts-mid', 'peak'],
      ['ts-treble', 'highshelf'],
      ['ts-presence', 'peak'],
    ]);
    expect(f.find((x) => x.id === 'ts-mid')!.freq).toBe(600);
    const [lo, at600] = mag(f, [25, 600]);
    expect(lo).toBeCloseTo(6, 0);
    expect(at600).toBeLessThan(-3);
  });

  it('frequência de médio inválida volta ao padrão', () => {
    expect(normalizeToneStackState({ midFreq: 777 }).midFreq).toBe(800);
  });
});

describe('tilt', () => {
  it('+6 dB: grave desce ~6, agudo sobe ~6, pivô fica em 0', () => {
    const f = compileTilt({ tiltDb: 6, pivotHz: 800 });
    const [lo, pivot, hi] = mag(f, [20, 800, 20000]);
    expect(lo).toBeLessThan(-5);
    expect(hi).toBeGreaterThan(5);
    expect(Math.abs(pivot!)).toBeLessThan(0.01);
  });

  it('é antissimétrico: −t espelha +t', () => {
    const a = mag(compileTilt({ tiltDb: 4, pivotHz: 800 }), fine);
    const b = mag(compileTilt({ tiltDb: -4, pivotHz: 800 }), fine);
    for (let i = 0; i < a.length; i += 50) expect(a[i]!).toBeCloseTo(-b[i]!, 6);
  });
});
