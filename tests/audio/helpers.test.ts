import { describe, expect, it } from 'vitest';
import {
  channelOptions,
  dbToLin,
  defaultChannelSelection,
  hardClipCurve,
  loudnessCompensation,
  rms,
} from '../../src/audio/helpers';
import { synthLoop } from '../../src/audio/placeholderLoops';

describe('limiter: hard clip a −1 dBFS', () => {
  it('nada sai acima do teto; abaixo dele passa intacto', () => {
    const curve = hardClipCurve(-1);
    const c = dbToLin(-1);
    expect(Math.max(...curve)).toBeCloseTo(c, 6);
    expect(Math.min(...curve)).toBeCloseTo(-c, 6);
    // Ponto do meio (entrada 0) = 0; entrada 0,5 = 0,5
    expect(curve[(curve.length - 1) / 2]).toBe(0);
    expect(curve[Math.round(((0.5 + 1) / 2) * (curve.length - 1))]).toBeCloseTo(0.5, 3);
  });
});

describe('compensação de volume do A/B', () => {
  it('iguala RMS e limita a ±18 dB', () => {
    expect(loudnessCompensation(0.5, 0.25)).toBeCloseTo(2, 6);
    expect(loudnessCompensation(1, 0.001)).toBeCloseTo(dbToLin(18), 6);
    expect(loudnessCompensation(0.001, 1)).toBeCloseTo(dbToLin(-18), 6);
  });

  it('silêncio não mexe no ganho', () => {
    expect(loudnessCompensation(1e-5, 0.5)).toBeNull();
  });

  it('rms de uma senoide de pico 1 ≈ 0,707', () => {
    const x = Float64Array.from({ length: 4800 }, (_, i) => Math.sin((2 * Math.PI * 100 * i) / 48000));
    expect(rms(x)).toBeCloseTo(Math.SQRT1_2, 3);
  });
});

describe('seleção de canais de entrada', () => {
  it('opções individuais e em pares', () => {
    expect(channelOptions(4).map((o) => o.id)).toEqual(['1', '2', '3', '4', '1+2', '3+4']);
    expect(channelOptions(4).find((o) => o.id === '3+4')!.channels).toEqual([2, 3]);
    expect(channelOptions(1).map((o) => o.id)).toEqual(['1']);
  });

  it('Nano com 4 canais começa no 3+4; com só 2 canais cai para 1+2', () => {
    const nano = { processed: [3, 4], di: 1 };
    expect(defaultChannelSelection(4, nano)).toBe('3+4');
    expect(defaultChannelSelection(2, nano)).toBe('1+2');
    expect(defaultChannelSelection(1)).toBe('1');
  });
});

describe('loops placeholder', () => {
  it('8 s a 48 kHz, pico em −1 dBFS, sem NaN; estilos diferentes soam diferentes', () => {
    const clean = synthLoop('clean');
    const hg = synthLoop('highgain');
    expect(clean).toHaveLength(48000 * 8);
    const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak(clean)).toBeCloseTo(dbToLin(-1), 4);
    expect(clean.every(Number.isFinite)).toBe(true);
    // high gain é muito mais comprimido: RMS mais perto do pico
    expect(rms(hg) / peak(hg)).toBeGreaterThan(rms(clean) / peak(clean));
  });
});
