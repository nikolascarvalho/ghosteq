// "Compiladores": estado de cada modo → lista de filtros. Funções puras.
import { designCascade } from '../biquad';
import { cascadeMagnitudeDb } from '../response';
import type { FilterSpec } from '../types';
import {
  DEFAULT_HPF,
  DEFAULT_LPF,
  GRAPHIC_LAYOUTS,
  GRAPHIC_RANGE_DB,
  TILT_RANGE_DB,
  TILT_SHELF_Q,
  TONESTACK,
  TONESTACK_RANGE_DB,
} from './config';
import type {
  CompiledFilter,
  CutFilter,
  GraphicMode,
  GraphicState,
  TiltState,
  ToneStackState,
} from './types';

/** Taxa usada só para calcular a correção dos sliders (a curva final usa a do aparelho). */
const DESIGN_FS = 48000;
const CORRECTION_ITERATIONS = 3;

function cuts(prefix: string, hpf: CutFilter, lpf: CutFilter): CompiledFilter[] {
  const out: CompiledFilter[] = [];
  if (hpf.enabled)
    out.push({ id: `${prefix}-hpf`, type: 'hpf12', freq: hpf.freq, gainDb: 0, q: Math.SQRT1_2 });
  if (lpf.enabled)
    out.push({ id: `${prefix}-lpf`, type: 'lpf12', freq: lpf.freq, gainDb: 0, q: Math.SQRT1_2 });
  return out;
}

/**
 * Q proporcional: quanto maior |ganho|, mais estreita a banda. Com pouco ganho a
 * banda é larga e suave; com muito ganho, estreita, para não "vazar" nas vizinhas.
 * Fórmula escolhida por protótipo numérico (ver README).
 */
export function proportionalQ(baseQ: number, gainDb: number): number {
  return baseQ * (0.7 + Math.abs(gainDb) / GRAPHIC_RANGE_DB);
}

function graphicPeaks(mode: GraphicMode, internalGains: number[]): CompiledFilter[] {
  const { freqs, baseQ } = GRAPHIC_LAYOUTS[mode];
  return freqs.map((freq, i) => {
    const g = internalGains[i] ?? 0;
    return { id: `${mode}-${i}`, type: 'peak', freq, gainDb: g, q: proportionalQ(baseQ, g) };
  });
}

/**
 * Modo gráfico. Mesmo com Q proporcional, bandas vizinhas se somam um pouco.
 * Para a curva bater com o que os sliders mostram, corrige iterativamente os
 * ganhos internos: g ← g + (valor do slider − curva no centro da banda).
 * HPF/LPF ficam fora da correção (não queremos "compensar" um corte pedido).
 */
export function compileGraphic(mode: GraphicMode, state: GraphicState): CompiledFilter[] {
  const { freqs } = GRAPHIC_LAYOUTS[mode];
  const target = freqs.map((_, i) => state.gainsDb[i] ?? 0);
  const gains = [...target];
  if (target.some((g) => g !== 0)) {
    for (let it = 0; it < CORRECTION_ITERATIONS; it++) {
      const resp = cascadeMagnitudeDb(designCascade(graphicPeaks(mode, gains), DESIGN_FS), freqs, DESIGN_FS);
      // Inclui sliders em 0: um slider zerado entre dois vizinhos levantados
      // também deve ficar em ~0 dB na curva final.
      for (let i = 0; i < gains.length; i++) gains[i] = gains[i]! + (target[i]! - resp[i]!);
    }
  }
  return [...cuts(mode, state.hpf, state.lpf), ...graphicPeaks(mode, gains)];
}

export function compileToneStack(s: ToneStackState): CompiledFilter[] {
  return [
    ...cuts('ts', s.hpf, s.lpf),
    { id: 'ts-bass', type: 'lowshelf', freq: TONESTACK.bass.freq, gainDb: s.bassDb, q: TONESTACK.bass.q },
    { id: 'ts-mid', type: 'peak', freq: s.midFreq, gainDb: s.midDb, q: TONESTACK.midQ },
    {
      id: 'ts-treble',
      type: 'highshelf',
      freq: TONESTACK.treble.freq,
      gainDb: s.trebleDb,
      q: TONESTACK.treble.q,
    },
    {
      id: 'ts-presence',
      type: 'peak',
      freq: TONESTACK.presence.freq,
      gainDb: s.presenceDb,
      q: TONESTACK.presence.q,
    },
  ];
}

/**
 * Tilt: low shelf (−t) + high shelf (+t) no mesmo pivô. No pivô os dois se
 * anulam (0 dB); abaixo vai a −t, acima a +t.
 */
export function compileTilt(s: TiltState): CompiledFilter[] {
  return [
    { id: 'tilt-low', type: 'lowshelf', freq: s.pivotHz, gainDb: -s.tiltDb, q: TILT_SHELF_Q },
    { id: 'tilt-high', type: 'highshelf', freq: s.pivotHz, gainDb: s.tiltDb, q: TILT_SHELF_Q },
  ];
}

// ---------- Estados padrão e normalização (presets importados) ----------

const clamp = (v: unknown, lo: number, hi: number, dflt: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function normCut(v: unknown, dfltFreq: number): CutFilter {
  const o = isObj(v) ? v : {};
  return { enabled: o.enabled === true, freq: clamp(o.freq, 10, 24000, dfltFreq) };
}

export function defaultGraphicState(mode: GraphicMode): GraphicState {
  return {
    gainsDb: GRAPHIC_LAYOUTS[mode].freqs.map(() => 0),
    hpf: { enabled: false, freq: DEFAULT_HPF },
    lpf: { enabled: false, freq: DEFAULT_LPF },
  };
}

export function normalizeGraphicState(mode: GraphicMode, raw: unknown): GraphicState {
  const o = isObj(raw) ? raw : {};
  const n = GRAPHIC_LAYOUTS[mode].freqs.length;
  const gains = Array.isArray(o.gainsDb) ? o.gainsDb : [];
  return {
    gainsDb: Array.from({ length: n }, (_, i) => clamp(gains[i], -GRAPHIC_RANGE_DB, GRAPHIC_RANGE_DB, 0)),
    hpf: normCut(o.hpf, DEFAULT_HPF),
    lpf: normCut(o.lpf, DEFAULT_LPF),
  };
}

export function defaultToneStackState(): ToneStackState {
  return {
    bassDb: 0,
    midDb: 0,
    midFreq: 800,
    trebleDb: 0,
    presenceDb: 0,
    hpf: { enabled: false, freq: DEFAULT_HPF },
    lpf: { enabled: false, freq: DEFAULT_LPF },
  };
}

export function normalizeToneStackState(raw: unknown): ToneStackState {
  const o = isObj(raw) ? raw : {};
  const R = TONESTACK_RANGE_DB;
  const midFreq = (TONESTACK.midFreqs as readonly number[]).includes(o.midFreq as number)
    ? (o.midFreq as number)
    : 800;
  return {
    bassDb: clamp(o.bassDb, -R, R, 0),
    midDb: clamp(o.midDb, -R, R, 0),
    midFreq,
    trebleDb: clamp(o.trebleDb, -R, R, 0),
    presenceDb: clamp(o.presenceDb, -R, R, 0),
    hpf: normCut(o.hpf, DEFAULT_HPF),
    lpf: normCut(o.lpf, DEFAULT_LPF),
  };
}

export function defaultTiltState(): TiltState {
  return { tiltDb: 0, pivotHz: 800 };
}

export function normalizeTiltState(raw: unknown): TiltState {
  const o = isObj(raw) ? raw : {};
  return {
    tiltDb: clamp(o.tiltDb, -TILT_RANGE_DB, TILT_RANGE_DB, 0),
    pivotHz: clamp(o.pivotHz, 100, 5000, 800),
  };
}

// ---------- Paramétrico → gráfico (aproximação) ----------

/**
 * Ajusta os sliders de um modo gráfico para imitar uma curva qualquer:
 * amostra a curva nos centros das bandas e corrige iterativamente.
 * HPF/LPF da curva de origem viram o HPF/LPF do modo (o primeiro de cada).
 * É APROXIMAÇÃO: detalhes mais estreitos que uma banda se perdem.
 */
export function fitGraphic(mode: GraphicMode, source: FilterSpec[]): GraphicState {
  const { freqs } = GRAPHIC_LAYOUTS[mode];
  const hp = source.find((s) => s.type === 'hpf12' || s.type === 'hpf24');
  const lp = source.find((s) => s.type === 'lpf12' || s.type === 'lpf24');
  const shaping = source.filter((s) => !['hpf12', 'hpf24', 'lpf12', 'lpf24'].includes(s.type));
  const target = cascadeMagnitudeDb(designCascade(shaping, DESIGN_FS), freqs, DESIGN_FS);
  const R = GRAPHIC_RANGE_DB;
  const round = (v: number) => Math.round(Math.min(R, Math.max(-R, v)) * 10) / 10;

  // Como a compilação já corrige a interação entre bandas, o valor de cada slider
  // é simplesmente a curva-alvo no centro da banda.
  return {
    gainsDb: Array.from(target, round),
    hpf: hp ? { enabled: true, freq: hp.freq } : { enabled: false, freq: DEFAULT_HPF },
    lpf: lp ? { enabled: true, freq: lp.freq } : { enabled: false, freq: DEFAULT_LPF },
  };
}
