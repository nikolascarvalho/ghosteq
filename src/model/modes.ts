// Ponte entre o modelo da curva e os compiladores de modo (dsp/modes).
import {
  compileGraphic,
  compileTilt,
  compileToneStack,
  defaultGraphicState,
  defaultTiltState,
  defaultToneStackState,
  normalizeGraphicState,
  normalizeTiltState,
  normalizeToneStackState,
  type CompiledFilter,
  type GraphicMode,
  type GraphicState,
  type ModeStates,
  type TiltState,
  type ToneStackState,
} from '../dsp/modes';
import type { Band, EqMode } from './curve';

export const GRAPHIC_MODES: readonly GraphicMode[] = ['graphic9', 'graphic10', 'graphic31'];
export const isGraphicMode = (m: EqMode): m is GraphicMode =>
  (GRAPHIC_MODES as readonly string[]).includes(m);

/** Estado do modo (salvo ou padrão), já normalizado. */
export function stateFor(mode: Exclude<EqMode, 'parametric'>, states: ModeStates | undefined) {
  if (isGraphicMode(mode)) return normalizeGraphicState(mode, states?.[mode] ?? defaultGraphicState(mode));
  if (mode === 'tonestack') return normalizeToneStackState(states?.tonestack ?? defaultToneStackState());
  return normalizeTiltState(states?.tilt ?? defaultTiltState());
}

/** Getters tipados (a UI usa estes). */
export const graphicStateOf = (mode: GraphicMode, s: ModeStates | undefined): GraphicState =>
  normalizeGraphicState(mode, s?.[mode] ?? defaultGraphicState(mode));
export const toneStackStateOf = (s: ModeStates | undefined): ToneStackState =>
  normalizeToneStackState(s?.tonestack ?? defaultToneStackState());
export const tiltStateOf = (s: ModeStates | undefined): TiltState =>
  normalizeTiltState(s?.tilt ?? defaultTiltState());

/** Compila o modo atual na lista de bandas (todas ligadas, ids estáveis). */
export function compileModeBands(
  mode: Exclude<EqMode, 'parametric'>,
  states: ModeStates | undefined,
): Band[] {
  let filters: CompiledFilter[];
  if (isGraphicMode(mode)) filters = compileGraphic(mode, normalizeGraphicState(mode, states?.[mode]));
  else if (mode === 'tonestack') filters = compileToneStack(normalizeToneStackState(states?.tonestack));
  else filters = compileTilt(normalizeTiltState(states?.tilt));
  return filters.map((f) => ({ ...f, enabled: true }));
}

/** Normaliza o modeState vindo de um preset (ignora chaves desconhecidas). */
export function normalizeModeStates(raw: unknown): ModeStates {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: ModeStates = {};
  for (const m of GRAPHIC_MODES) if (r[m] !== undefined) out[m] = normalizeGraphicState(m, r[m]);
  if (r.tonestack !== undefined) out.tonestack = normalizeToneStackState(r.tonestack);
  if (r.tilt !== undefined) out.tilt = normalizeTiltState(r.tilt);
  return out;
}

/** true se nenhuma banda altera o som (usado para decidir se trocar de modo "perde" algo). */
export function isFlat(bands: Band[]): boolean {
  return bands.every(
    (b) =>
      !b.enabled ||
      ((b.type === 'peak' || b.type === 'lowshelf' || b.type === 'highshelf') && Math.abs(b.gainDb) < 0.05),
  );
}
