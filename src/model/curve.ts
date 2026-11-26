// Modelo de dados da curva: o "schema" da fonte da verdade do app.
// Fica numa camada própria (abaixo de state/ e io/) porque os dois precisam dele:
// state/ guarda, io/ salva/carrega, workers/ consomem. Só tipos, constantes e
// funções puras.
import type { FilterSpec, FilterType } from '../dsp/types';

/** Versão atual do schema. Ao mudar o formato: incremente e escreva uma migração em io/presetsJson.ts. */
export const CURVE_SCHEMA_VERSION = 1;

export const EQ_MODES = ['parametric', 'graphic9', 'graphic10', 'graphic31', 'tonestack', 'tilt'] as const;
export type EqMode = (typeof EQ_MODES)[number];

export const FILTER_TYPES: readonly FilterType[] = [
  'peak',
  'lowshelf',
  'highshelf',
  'hpf12',
  'hpf24',
  'lpf12',
  'lpf24',
  'notch',
];

/** Uma banda editável (o que aparece como "bolinha" no gráfico). */
export interface Band extends FilterSpec {
  id: string;
  enabled: boolean;
}

/** Limites aceitos (validação de presets importados e da UI). */
export const LIMITS = {
  freq: { min: 10, max: 24000 },
  gainDb: { min: -36, max: 36 },
  q: { min: 0.025, max: 40 },
  outputGainDb: { min: -36, max: 36 },
  maxBands: 64,
  customSampleRate: { min: 8000, max: 192000 },
  customIrLength: { min: 64, max: 65536 },
} as const;

/** Parâmetros do aparelho "Customizado" (sample rate e tamanho livres). */
export interface CustomDevice {
  sampleRate: number;
  irLength: number;
}

/**
 * Configuração completa de uma curva. Serializada como JSON nos presets.
 * `modeState` guarda o estado específico do modo (sliders do gráfico, knobs do
 * tone stack, tilt); o formato de cada modo é definido na etapa dos modos.
 */
export interface CurveConfig {
  schemaVersion: typeof CURVE_SCHEMA_VERSION;
  mode: EqMode;
  bands: Band[];
  modeState?: Record<string, unknown>;
  outputGainDb: number;
  devicePresetId: string;
  /** Usado só quando devicePresetId = 'custom'. */
  customDevice?: CustomDevice;
}

/**
 * Layout inicial do modo paramétrico: 7 bandas que não alteram nada até o
 * usuário mexer (peaks/shelves em 0 dB, HPF/LPF desligados) → IR flat.
 */
export function defaultParametricBands(): Band[] {
  const b = (id: string, type: Band['type'], freq: number, q: number, enabled = true): Band => ({
    id,
    type,
    freq,
    gainDb: 0,
    q,
    enabled,
  });
  return [
    b('hpf', 'hpf12', 80, Math.SQRT1_2, false),
    b('low', 'lowshelf', 120, Math.SQRT1_2),
    b('lowmid', 'peak', 400, 1),
    b('mid', 'peak', 1000, 1),
    b('highmid', 'peak', 3000, 1),
    b('high', 'highshelf', 6000, Math.SQRT1_2),
    b('lpf', 'lpf12', 10000, Math.SQRT1_2, false),
  ];
}

export function defaultCurve(devicePresetId: string): CurveConfig {
  return { ...flatCurve(devicePresetId), bands: defaultParametricBands() };
}

export function flatCurve(devicePresetId: string): CurveConfig {
  return {
    schemaVersion: CURVE_SCHEMA_VERSION,
    mode: 'parametric',
    bands: [],
    outputGainDb: 0,
    devicePresetId,
  };
}

/** Bandas ligadas, prontas para virar biquads. */
export function activeSpecs(curve: CurveConfig): FilterSpec[] {
  return curve.bands.filter((b) => b.enabled).map(({ type, freq, gainDb, q }) => ({ type, freq, gainDb, q }));
}
