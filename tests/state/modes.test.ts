import { beforeEach, describe, expect, it } from 'vitest';
import { cascadeMagnitudeDb, designCascade, logFrequencies } from '../../src/dsp';
import { defaultGraphicState } from '../../src/dsp/modes';
import { parseCurve } from '../../src/io/presetsJson';
import { activeSpecs, defaultCurve, type CurveConfig } from '../../src/model/curve';
import { useCurveStore } from '../../src/state/curveStore';

const s = () => useCurveStore.getState();
const freqs = logFrequencies(400, 20, 20000);
const curveDb = (c: CurveConfig) => cascadeMagnitudeDb(designCascade(activeSpecs(c), 48000), freqs, 48000);

beforeEach(() => {
  useCurveStore.setState({
    curve: defaultCurve('nano-cortex'),
    history: { past: [], future: [] },
    gestureStart: null,
  });
});

describe('troca de modos no store', () => {
  it('gráfico → paramétrico reproduz a curva EXATAMENTE (sem perda)', () => {
    s().setMode('graphic9');
    const g = { ...defaultGraphicState('graphic9'), gainsDb: [3, -2, 0, 4, -6, 2, 5, -3, 1] };
    s().setModeState('graphic9', g);
    const before = curveDb(s().curve);
    s().setMode('parametric');
    expect(s().curve.mode).toBe('parametric');
    const after = curveDb(s().curve);
    for (let i = 0; i < freqs.length; i++) expect(after[i]).toBe(before[i]);
    // Cada controle virou banda editável
    expect(s().curve.bands.filter((b) => b.type === 'peak')).toHaveLength(9);
  });

  it('tone stack e tilt → paramétrico também sem perda', () => {
    for (const m of ['tonestack', 'tilt'] as const) {
      s().reset();
      s().setMode(m);
      if (m === 'tonestack')
        s().setModeState('tonestack', {
          bassDb: 4,
          midDb: -3,
          midFreq: 400,
          trebleDb: 2,
          presenceDb: 5,
          hpf: { enabled: true, freq: 90 },
          lpf: { enabled: false, freq: 10000 },
        });
      else s().setModeState('tilt', { tiltDb: -5, pivotHz: 1600 });
      const before = curveDb(s().curve);
      s().setMode('parametric');
      const after = curveDb(s().curve);
      for (let i = 0; i < freqs.length; i++) expect(after[i]).toBe(before[i]);
    }
  });

  it('paramétrico com curva → gráfico ajusta os sliders (aproximação)', () => {
    s().updateBand('highmid', { gainDb: -6, q: 1 });
    s().setMode('graphic10');
    const gains = s().curve.modeState!.graphic10!.gainsDb;
    expect(gains[7]).toBeLessThan(-3); // 4 kHz (perto de 3 kHz)
    expect(Math.abs(gains[0]!)).toBeLessThan(0.5); // 31,5 Hz intocado
  });

  it('volta ao modo restaura os controles que estavam lá', () => {
    s().setMode('tilt');
    s().setModeState('tilt', { tiltDb: 3, pivotHz: 800 });
    s().setMode('parametric');
    s().reset(); // curva flat de novo
    s().setMode('tilt');
    expect(s().curve.modeState!.tilt!.tiltDb).toBe(3);
  });

  it('gráfico flat → paramétrico volta ao layout padrão (sem 31 pontos inúteis)', () => {
    s().setMode('graphic31');
    s().setMode('parametric');
    expect(s().curve.bands.map((b) => b.id)).toEqual(defaultCurve('nano-cortex').bands.map((b) => b.id));
  });

  it('trocar de modo é desfazível', () => {
    s().setMode('graphic31');
    expect(s().curve.mode).toBe('graphic31');
    s().undo();
    expect(s().curve.mode).toBe('parametric');
  });

  it('zerar num modo não paramétrico zera os controles e mantém o modo', () => {
    s().setMode('graphic9');
    s().setModeState('graphic9', {
      ...defaultGraphicState('graphic9'),
      gainsDb: [6, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    s().reset();
    expect(s().curve.mode).toBe('graphic9');
    expect(curveDb(s().curve).every((v) => Math.abs(v) < 1e-9)).toBe(true);
  });
});

describe('presets com modo', () => {
  it('ao carregar, as bandas são recompiladas a partir dos controles do modo', () => {
    s().setMode('graphic9');
    s().setModeState('graphic9', {
      ...defaultGraphicState('graphic9'),
      gainsDb: [0, 0, 0, 0, 5, 0, 0, 0, 0],
    });
    const saved = s().curve;
    // Simula arquivo adulterado: bandas não batem com os sliders
    const tampered = { ...saved, bands: [] };
    const r = parseCurve(JSON.parse(JSON.stringify(tampered)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.bands).toEqual(saved.bands);
  });
});
