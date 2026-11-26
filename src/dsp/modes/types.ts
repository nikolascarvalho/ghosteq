// Estado de cada modo de EQ (o que os controles da tela mostram).
// Cada modo é "compilado" numa lista de filtros (FilterSpec) — a mesma
// linguagem do modo paramétrico. Analogia: vários front-ends de SQL que
// geram o mesmo plano de execução.
import type { FilterSpec } from '../types';

export type GraphicMode = 'graphic9' | 'graphic10' | 'graphic31';

export interface CutFilter {
  enabled: boolean;
  freq: number;
}

export interface GraphicState {
  /** Valor de cada slider em dB (mesma ordem das frequências do modo). */
  gainsDb: number[];
  hpf: CutFilter;
  lpf: CutFilter;
}

export interface ToneStackState {
  bassDb: number;
  midDb: number;
  midFreq: number;
  trebleDb: number;
  presenceDb: number;
  hpf: CutFilter;
  lpf: CutFilter;
}

export interface TiltState {
  /** + = mais agudo e menos grave; − = o contrário. */
  tiltDb: number;
  pivotHz: number;
}

export interface ModeStates {
  graphic9?: GraphicState;
  graphic10?: GraphicState;
  graphic31?: GraphicState;
  tonestack?: ToneStackState;
  tilt?: TiltState;
}

/** Filtro compilado com um id estável (liga o controle da tela ao desvio calculado). */
export interface CompiledFilter extends FilterSpec {
  id: string;
}
