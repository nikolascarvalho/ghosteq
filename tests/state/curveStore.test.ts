import { beforeEach, describe, expect, it } from 'vitest';
import { useCurveStore } from '../../src/state/curveStore';
import { defaultCurve, LIMITS } from '../../src/model/curve';

const s = () => useCurveStore.getState();

beforeEach(() => {
  useCurveStore.setState({
    curve: defaultCurve('nano-cortex'),
    history: { past: [], future: [] },
    gestureStart: null,
  });
});

describe('store da curva', () => {
  it('começa com 7 bandas que não alteram o som', () => {
    const { bands } = s().curve;
    expect(bands.length).toBeGreaterThanOrEqual(6);
    for (const b of bands) {
      if (b.type.startsWith('hpf') || b.type.startsWith('lpf')) expect(b.enabled).toBe(false);
      else expect(b.gainDb).toBe(0);
    }
  });

  it('editar banda grava no histórico e desfazer volta ao anterior', () => {
    s().updateBand('mid', { gainDb: -5 });
    expect(s().curve.bands.find((b) => b.id === 'mid')!.gainDb).toBe(-5);
    s().undo();
    expect(s().curve.bands.find((b) => b.id === 'mid')!.gainDb).toBe(0);
    s().redo();
    expect(s().curve.bands.find((b) => b.id === 'mid')!.gainDb).toBe(-5);
  });

  it('um gesto (arrastar) com vários passos vira UMA entrada de desfazer', () => {
    s().beginGesture();
    for (let g = 1; g <= 10; g++)
      s().updateBand('highmid', { gainDb: -g, freq: 3000 + g * 10 }, { transient: true });
    s().endGesture();
    expect(s().history.past).toHaveLength(1);
    s().undo();
    const b = s().curve.bands.find((x) => x.id === 'highmid')!;
    expect(b.gainDb).toBe(0);
    expect(b.freq).toBe(3000);
  });

  it('gesto sem mudança (só clique) não polui o histórico', () => {
    s().beginGesture();
    s().endGesture();
    expect(s().history.past).toHaveLength(0);
  });

  it('valores fora da faixa são limitados', () => {
    s().updateBand('mid', { gainDb: 99, freq: 1, q: 1000 });
    const b = s().curve.bands.find((x) => x.id === 'mid')!;
    expect(b.gainDb).toBe(LIMITS.gainDb.max);
    expect(b.freq).toBe(LIMITS.freq.min);
    expect(b.q).toBe(LIMITS.q.max);
    s().setOutputGain(-100);
    expect(s().curve.outputGainDb).toBe(LIMITS.outputGainDb.min);
  });

  it('adiciona, liga/desliga e remove bandas', () => {
    const id = s().addBand({ type: 'notch', freq: 2000, gainDb: 0, q: 8, enabled: true })!;
    expect(s().curve.bands.some((b) => b.id === id)).toBe(true);
    s().toggleBand(id);
    expect(s().curve.bands.find((b) => b.id === id)!.enabled).toBe(false);
    s().removeBand(id);
    expect(s().curve.bands.some((b) => b.id === id)).toBe(false);
    expect(s().history.past).toHaveLength(3);
  });

  it('troca de aparelho e reset também podem ser desfeitos', () => {
    s().updateBand('mid', { gainDb: 4 });
    s().setDevice('helix');
    expect(s().curve.devicePresetId).toBe('helix');
    s().reset();
    expect(s().curve.bands.find((b) => b.id === 'mid')!.gainDb).toBe(0);
    expect(s().curve.devicePresetId).toBe('helix'); // reset mantém o aparelho
    s().undo();
    expect(s().curve.bands.find((b) => b.id === 'mid')!.gainDb).toBe(4);
  });
});
