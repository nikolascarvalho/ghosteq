import { describe, expect, it } from 'vitest';
import { getDevicePreset } from '../../src/config/devices';
import { exportFileName, formatFreq, formatGain } from '../../src/io/fileName';
import type { Band, CurveConfig } from '../../src/model/curve';

const nano = getDevicePreset('nano-cortex');
const helix = getDevicePreset('helix');

const band = (b: Partial<Band>): Band => ({
  id: Math.random().toString(36),
  type: 'peak',
  freq: 1000,
  gainDb: 0,
  q: 1,
  enabled: true,
  ...b,
});

const curve = (bands: Band[], outputGainDb = 0): CurveConfig => ({
  schemaVersion: 1,
  mode: 'parametric',
  bands,
  outputGainDb,
  devicePresetId: 'nano-cortex',
});

describe('nome do arquivo exportado', () => {
  it('exemplo do enunciado: EQ_3k-5dB_+9dB_Nano1024.wav', () => {
    expect(exportFileName(curve([band({ freq: 3000, gainDb: -5 })], 9), nano)).toBe(
      'EQ_3k-5dB_+9dB_Nano1024.wav',
    );
  });

  it('curva flat', () => {
    expect(exportFileName(curve([]), helix)).toBe('EQ_flat_Helix2048.wav');
  });

  it('ignora bandas desligadas e peaks em 0 dB; HPF/LPF/shelves com prefixo', () => {
    const name = exportFileName(
      curve([
        band({ type: 'hpf24', freq: 80 }),
        band({ type: 'highshelf', freq: 6000, gainDb: -3 }),
        band({ freq: 500, gainDb: 0 }),
        band({ freq: 2000, gainDb: 6, enabled: false }),
      ]),
      nano,
    );
    expect(name).toBe('EQ_HP80_HS6k-3dB_Nano1024.wav');
  });

  it('mostra as 3 bandas mais fortes e conta o resto', () => {
    const name = exportFileName(
      curve([
        band({ freq: 200, gainDb: 1 }),
        band({ freq: 800, gainDb: -6 }),
        band({ freq: 2500, gainDb: 4 }),
        band({ freq: 5000, gainDb: -2 }),
      ]),
      nano,
    );
    expect(name).toBe('EQ_800-6dB_2k5+4dB_5k-2dB_+1_Nano1024.wav');
  });

  it('prefixo personalizado (caixa + EQ) e limite de tamanho', () => {
    const many = Array.from({ length: 10 }, (_, i) => band({ freq: 1000 + i * 1111, gainDb: -12.3 }));
    const name = exportFileName(curve(many, -3.5), nano, { prefix: 'CAB+EQ' });
    expect(name.startsWith('CAB+EQ_')).toBe(true);
    expect(name.endsWith('_Nano1024.wav')).toBe(true);
    expect(name.length).toBeLessThanOrEqual(64);
  });

  it('formatação de frequência e ganho', () => {
    expect(formatFreq(80)).toBe('80');
    expect(formatFreq(1000)).toBe('1k');
    expect(formatFreq(2500)).toBe('2k5');
    expect(formatFreq(12000)).toBe('12k');
    expect(formatGain(9)).toBe('+9dB');
    expect(formatGain(-4.54)).toBe('-4.5dB');
    expect(formatGain(0)).toBe('0dB');
  });
});
