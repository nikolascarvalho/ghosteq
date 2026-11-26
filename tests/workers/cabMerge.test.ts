import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cascadeMagnitudeDb,
  designCascade,
  impulseResponse,
  logFrequencies,
  smoothedMagnitudeDb,
  truncateWithFade,
  type FilterSpec,
} from '../../src/dsp';
import { cabToken, exportFileName } from '../../src/io/fileName';
import { getDevicePreset } from '../../src/config/devices';
import { encodeWav } from '../../src/io/wavEncode';
import { defaultCurve, flatCurve, type CurveConfig } from '../../src/model/curve';
import { selectCabInput, useCabStore } from '../../src/state/cabStore';
import { computeIr, prepareCab } from '../../src/workers/irEngine';
import { maxAbsDiff } from '../helpers';

/** "Caixa" sintética: um IR com cara de caixa (HPF + ressonância + LPF), em Float32. */
const CAB_SPECS: FilterSpec[] = [
  { type: 'hpf12', freq: 90, gainDb: 0, q: 0.9 },
  { type: 'peak', freq: 2500, gainDb: 5, q: 1.5 },
  { type: 'lpf24', freq: 5000, gainDb: 0, q: 0.707 },
];
function synthCab(fs: number, length = 4096): Float32Array {
  return Float32Array.from(impulseResponse(designCascade(CAB_SPECS, fs), length));
}

const withBand = (c: CurveConfig, id: string, patch: object): CurveConfig => ({
  ...c,
  bands: c.bands.map((b) => (b.id === id ? { ...b, ...patch } : b)),
});

describe('caixa + EQ no motor', () => {
  it('caixa = Dirac reproduz exatamente o IR só de EQ', () => {
    const curve = withBand(defaultCurve('nano-cortex'), 'highmid', { gainDb: -5, q: 1.4 });
    const dirac = new Float32Array(1024);
    dirac[0] = 1;
    const a = computeIr({ id: 1, curve });
    const b = computeIr({ id: 1, curve, cab: { samples: dirac, sampleRate: 48000 } });
    expect(maxAbsDiff(a.ir, b.ir)).toBeLessThan(1e-12);
  });

  it('EQ flat: o resultado é a própria caixa cortada (com fade) no tamanho do aparelho', () => {
    const cab = synthCab(48000);
    const r = computeIr({ id: 1, curve: flatCurve('nano-cortex'), cab: { samples: cab, sampleRate: 48000 } });
    expect(r.ir).toHaveLength(1024);
    expect(maxAbsDiff(r.ir, truncateWithFade(Float64Array.from(cab), 1024))).toBeLessThan(1e-7);
    expect(r.ir[1023]).toBe(0);
  });

  it('curva combinada ≈ caixa + EQ (±0,5 dB de 200 Hz a 10 kHz)', () => {
    const cab = synthCab(48000);
    const curve = withBand(defaultCurve('helix'), 'mid', { gainDb: -6, q: 1 });
    const r = computeIr({ id: 1, curve, cab: { samples: cab, sampleRate: 48000 } });
    expect(r.cabDb).toBeDefined();
    expect(r.eqDb).toBeDefined();
    r.freqs.forEach((f, i) => {
      if (f < 200 || f > 10000) return;
      expect(Math.abs(r.realDb[i]! - (r.cabDb![i]! + r.eqDb![i]!))).toBeLessThan(0.5);
    });
    // e o EQ continua "preciso" (sem avisos nas bandas dos médios)
    expect(r.bandDeviations.find((d) => d.bandId === 'mid')!.imprecise).toBe(false);
  });

  it('caixa de 44,1 kHz é convertida para 48 kHz preservando a curva', () => {
    const cab44 = synthCab(44100);
    const r = computeIr({ id: 1, curve: flatCurve('helix'), cab: { samples: cab44, sampleRate: 44100 } });
    expect(r.sampleRate).toBe(48000);
    expect(r.ir).toHaveLength(2048);
    // Referência: a resposta exata da caixa ORIGINAL (44,1 kHz). O resample não
    // pode mudar a curva; só a taxa de amostragem.
    const ref = cascadeMagnitudeDb(designCascade(CAB_SPECS, 44100), r.freqs, 44100);
    r.freqs.forEach((f, i) => {
      if (f < 100 || f > 10000) return;
      expect(Math.abs(r.cabDb![i]! - ref[i]!)).toBeLessThan(0.5);
    });
  });

  it('prepareCab completa com zeros quando a caixa é mais curta que o aparelho', () => {
    const out = prepareCab({ samples: Float32Array.from([0.5, 0.25]), sampleRate: 48000 }, 48000, 8);
    expect(Array.from(out)).toEqual([0.5, 0.25, 0, 0, 0, 0, 0, 0]);
  });

  it('ganho de saída é aplicado sobre a caixa', () => {
    const cab = synthCab(48000);
    const a = computeIr({ id: 1, curve: flatCurve('nano-cortex'), cab: { samples: cab, sampleRate: 48000 } });
    const b = computeIr({
      id: 1,
      curve: { ...flatCurve('nano-cortex'), outputGainDb: 6 },
      cab: { samples: cab, sampleRate: 48000 },
    });
    expect(b.peak / a.peak).toBeCloseTo(Math.pow(10, 6 / 20), 6);
  });
});

describe('suavização de espectro', () => {
  it('Dirac continua em 0 dB; um filtro suave quase não muda', () => {
    const freqs = logFrequencies(100, 50, 15000);
    const d = new Float64Array(1024);
    d[0] = 1;
    smoothedMagnitudeDb(d, freqs, 48000).forEach((v) => expect(Math.abs(v)).toBeLessThan(1e-9));
    const sections = designCascade([{ type: 'peak', freq: 2000, gainDb: 6, q: 0.7 }], 48000);
    const ir = impulseResponse(sections, 8192);
    const exact = cascadeMagnitudeDb(sections, freqs, 48000);
    const smooth = smoothedMagnitudeDb(ir, freqs, 48000);
    freqs.forEach((_, i) => expect(Math.abs(smooth[i]! - exact[i]!)).toBeLessThan(0.15));
  });
});

describe('importação da caixa (store)', () => {
  beforeEach(async () => {
    await useCabStore.getState().remove();
    useCabStore.setState({ enabled: true });
  });

  it('WAV mono: carrega, ativa e entrega ao motor', async () => {
    const wav = encodeWav([synthCab(44100, 2000)], { sampleRate: 44100, format: 'pcm24' });
    await useCabStore.getState().loadFromBuffer(wav, 'V30 SM57.wav');
    const s = useCabStore.getState();
    expect(s.error).toBeNull();
    expect(s.cab!.sampleRate).toBe(44100);
    expect(s.cab!.channels).toHaveLength(1);
    expect(selectCabInput(s)!.samples).toHaveLength(2000);
    useCabStore.getState().setEnabled(false);
    expect(selectCabInput(useCabStore.getState())).toBeUndefined();
  });

  it('WAV estéreo: L por padrão, média opcional', async () => {
    const L = new Float64Array([1, 0.5, 0]);
    const R = new Float64Array([0, 0.5, 1]);
    await useCabStore
      .getState()
      .loadFromBuffer(encodeWav([L, R], { sampleRate: 48000, format: 'float32' }), 'st.wav');
    expect(Array.from(useCabStore.getState().cab!.samples)).toEqual([1, 0.5, 0]);
    useCabStore.getState().setDownmix('mix');
    expect(Array.from(useCabStore.getState().cab!.samples)).toEqual([0.5, 0.5, 0.5]);
  });

  it('caixa salva volta depois de "recarregar" (IndexedDB)', async () => {
    await useCabStore
      .getState()
      .loadFromBuffer(encodeWav([synthCab(48000, 512)], { sampleRate: 48000, format: 'float32' }), 'x.wav');
    useCabStore.setState({ cab: null }); // simula página recarregada
    await useCabStore.getState().hydrate();
    expect(useCabStore.getState().cab?.name).toBe('x.wav');
    expect(useCabStore.getState().cab?.samples).toHaveLength(512);
  });

  it('arquivo que não é WAV vira erro amigável', async () => {
    await useCabStore
      .getState()
      .loadFromBuffer(new TextEncoder().encode('oi').buffer as ArrayBuffer, 'a.txt');
    expect(useCabStore.getState().error?.code).toBe('not-riff');
    expect(useCabStore.getState().cab).toBeNull();
  });

  it('caixa maior que 2 s é cortada e marcada', async () => {
    const long = new Float64Array(48000 * 3);
    long[0] = 1;
    await useCabStore
      .getState()
      .loadFromBuffer(encodeWav([long], { sampleRate: 48000, format: 'pcm16' }), 'l.wav');
    expect(useCabStore.getState().cab!.trimmed).toBe(true);
    expect(useCabStore.getState().cab!.samples).toHaveLength(96000);
  });
});

describe('nome do arquivo com caixa', () => {
  it('prefixo CAB+ e nome curto da caixa', () => {
    const curve = withBand(defaultCurve('nano-cortex'), 'highmid', { gainDb: -5 });
    expect(exportFileName(curve, getDevicePreset('nano-cortex'), { cabName: 'Mesa 4x12 V30 SM57.wav' })).toBe(
      'CAB+EQ_Mesa4x12V30SM57_3k-5dB_Nano1024.wav',
    );
    expect(cabToken('Câmara Ação.WAV')).toBe('CamaraAcao');
    expect(cabToken('###.wav')).toBe('cab');
  });
});
