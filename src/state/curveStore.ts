// Store global (Zustand) com a FONTE DA VERDADE: a configuração da curva (JSON).
// Tudo o mais (IR, gráfico, áudio, exportação) é DERIVADO dela, como uma view
// materializada recalculada a partir da tabela base.
//
// Gestos (arrastar uma banda) viram UMA entrada no desfazer:
//   beginGesture() → várias updateBand(..., { transient: true }) → endGesture()
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_DEVICE_ID } from '../config/devices';
import { parseCurve } from '../io/presetsJson';
import { fitGraphic, type ModeStates } from '../dsp/modes';
import {
  activeSpecs,
  defaultCurve,
  defaultParametricBands,
  LIMITS,
  type Band,
  type CurveConfig,
  type CustomDevice,
  type EqMode,
} from '../model/curve';
import { compileModeBands, isFlat, isGraphicMode, stateFor } from '../model/modes';
import { emptyHistory, record, redo, undo, type History } from './history';

export interface EditOptions {
  /** true = não grava no histórico (use dentro de beginGesture/endGesture). */
  transient?: boolean;
}

interface CurveState {
  curve: CurveConfig;
  history: History<CurveConfig>;
  /** Snapshot do início do gesto em andamento (null = nenhum gesto). */
  gestureStart: CurveConfig | null;

  setCurve: (curve: CurveConfig, opts?: EditOptions) => void;
  updateBand: (id: string, patch: Partial<Omit<Band, 'id'>>, opts?: EditOptions) => void;
  addBand: (band: Omit<Band, 'id'>) => string | null;
  removeBand: (id: string) => void;
  toggleBand: (id: string) => void;
  setOutputGain: (db: number, opts?: EditOptions) => void;
  setDevice: (devicePresetId: string, custom?: CustomDevice) => void;
  reset: () => void;
  /**
   * Troca o modo de EQ.
   * - → paramétrico: SEM PERDA (as bandas compiladas viram bandas editáveis).
   * - → gráfico: se a curva atual altera o som, os sliders são AJUSTADOS para
   *   imitá-la (aproximação); se é flat, restaura o último estado do modo.
   * - → tone stack / tilt: restaura o último estado do modo (ou o padrão).
   */
  setMode: (mode: EqMode) => void;
  /** Atualiza os controles do modo atual e recompila as bandas. */
  setModeState: <M extends Exclude<EqMode, 'parametric'>>(
    mode: M,
    state: NonNullable<ModeStates[M]>,
    opts?: EditOptions,
  ) => void;
  beginGesture: () => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
}

const clamp = (v: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, v));

function clampBand(b: Band): Band {
  return {
    ...b,
    freq: clamp(b.freq, LIMITS.freq),
    gainDb: clamp(b.gainDb, LIMITS.gainDb),
    q: clamp(b.q, LIMITS.q),
  };
}

let idCounter = 0;
const newBandId = () => `band-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

export const useCurveStore = create<CurveState>()(
  persist(
    (set, get) => {
      /** Aplica uma mudança e cuida do histórico. */
      const commit = (next: CurveConfig, opts: EditOptions = {}) => {
        const { curve, history, gestureStart } = get();
        if (next === curve) return;
        if (opts.transient || gestureStart) set({ curve: next });
        else set({ curve: next, history: record(history, curve) });
      };
      const mapBands = (fn: (bands: Band[]) => Band[], opts?: EditOptions) => {
        const { curve } = get();
        commit({ ...curve, bands: fn(curve.bands) }, opts);
      };

      return {
        curve: defaultCurve(DEFAULT_DEVICE_ID),
        history: emptyHistory(),
        gestureStart: null,

        setCurve: (curve, opts) => commit(curve, opts),

        updateBand: (id, patch, opts) =>
          mapBands((bands) => bands.map((b) => (b.id === id ? clampBand({ ...b, ...patch }) : b)), opts),

        addBand: (band) => {
          if (get().curve.bands.length >= LIMITS.maxBands) return null;
          const id = newBandId();
          mapBands((bands) => [...bands, clampBand({ ...band, id })]);
          return id;
        },

        removeBand: (id) => mapBands((bands) => bands.filter((b) => b.id !== id)),

        toggleBand: (id) =>
          mapBands((bands) => bands.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b))),

        setOutputGain: (db, opts) =>
          commit({ ...get().curve, outputGainDb: clamp(db, LIMITS.outputGainDb) }, opts),

        setDevice: (devicePresetId, custom) => {
          const { curve } = get();
          const next: CurveConfig = { ...curve, devicePresetId };
          if (custom) next.customDevice = custom;
          commit(next);
        },

        reset: () => {
          const { curve } = get();
          if (curve.mode === 'parametric') {
            // Zera só o modo atual: controles salvos dos outros modos e o aparelho ficam.
            const next: CurveConfig = { ...defaultCurve(curve.devicePresetId) };
            if (curve.modeState) next.modeState = curve.modeState;
            if (curve.customDevice) next.customDevice = curve.customDevice;
            return commit(next);
          }
          // Fora do paramétrico, "zerar" volta os controles do modo atual ao padrão.
          const modeState: ModeStates = { ...curve.modeState, [curve.mode]: undefined };
          commit({ ...curve, outputGainDb: 0, modeState, bands: compileModeBands(curve.mode, modeState) });
        },

        setMode: (mode) => {
          const { curve } = get();
          if (mode === curve.mode) return;
          if (mode === 'parametric') {
            // Sem perda: bandas peak/shelf em 0 dB não alteram nada, então podem
            // sair (evita 31 pontos inúteis vindos do gráfico de 31 bandas).
            const audible = curve.bands.filter(
              (b) =>
                !((b.type === 'peak' || b.type === 'lowshelf' || b.type === 'highshelf') && b.gainDb === 0),
            );
            const bands = isFlat(audible) ? defaultParametricBands() : audible;
            return commit({ ...curve, mode, bands });
          }
          let modeState: ModeStates = { ...curve.modeState };
          if (isGraphicMode(mode) && !isFlat(curve.bands)) {
            modeState = { ...modeState, [mode]: fitGraphic(mode, activeSpecs(curve)) };
          } else {
            modeState = { ...modeState, [mode]: stateFor(mode, curve.modeState) };
          }
          commit({ ...curve, mode, modeState, bands: compileModeBands(mode, modeState) });
        },

        setModeState: (mode, state, opts) => {
          const { curve } = get();
          const modeState: ModeStates = { ...curve.modeState, [mode]: state };
          commit({ ...curve, mode, modeState, bands: compileModeBands(mode, modeState) }, opts);
        },

        beginGesture: () => {
          if (!get().gestureStart) set({ gestureStart: get().curve });
        },

        endGesture: () => {
          const { gestureStart, curve, history } = get();
          if (!gestureStart) return;
          // Só grava se o gesto mudou algo (um clique sem arrastar não polui o histórico).
          if (gestureStart !== curve) set({ gestureStart: null, history: record(history, gestureStart) });
          else set({ gestureStart: null });
        },

        undo: () => {
          const { history, curve } = get();
          const r = undo(history, curve);
          if (r) set({ curve: r.value, history: r.history, gestureStart: null });
        },

        redo: () => {
          const { history, curve } = get();
          const r = redo(history, curve);
          if (r) set({ curve: r.value, history: r.history, gestureStart: null });
        },
      };
    },
    {
      // Guarda só a curva atual no localStorage: recarregar a página não perde o trabalho.
      name: 'ghosteq.curve',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ curve: s.curve }),
      // Ao reidratar, passa pela mesma validação/migração dos presets.
      merge: (persisted, current) => {
        const parsed = parseCurve((persisted as { curve?: unknown } | undefined)?.curve);
        return parsed.ok ? { ...current, curve: parsed.value } : current;
      },
    },
  ),
);

/** Seletores prontos (evitam re-render desnecessário nos componentes). */
export const selectCanUndo = (s: CurveState) => s.history.past.length > 0;
export const selectCanRedo = (s: CurveState) => s.history.future.length > 0;
