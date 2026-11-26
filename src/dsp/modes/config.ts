// Frequências e faixas dos modos. Fácil de editar.
import type { GraphicMode } from './types';

/**
 * Graphic-9: as MESMAS frequências do bloco "Graphic-9" do Neural DSP Nano Cortex
 * (conferidas no app Cortex Mobile). Objetivo: copiar um preset do aparelho.
 * O bloco também tem HPF, LPF e OUTPUT — aqui viram HPF/LPF do modo e o ganho de saída.
 */
export const GRAPHIC9_FREQS = [65, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/** 10 bandas: oitavas ISO (31,5 Hz a 16 kHz). */
export const GRAPHIC10_FREQS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/** 31 bandas: 1/3 de oitava ISO (20 Hz a 20 kHz). */
export const GRAPHIC31_FREQS = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000,
  2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
];

export interface GraphicLayout {
  freqs: number[];
  /** Q de referência da largura de banda nominal (1 oitava ≈ 1,41; 1/3 oitava ≈ 4,32). */
  baseQ: number;
}

const octaveQ = (fraction: number) => Math.pow(2, fraction / 2) / (Math.pow(2, fraction) - 1);

export const GRAPHIC_LAYOUTS: Record<GraphicMode, GraphicLayout> = {
  graphic9: { freqs: GRAPHIC9_FREQS, baseQ: octaveQ(1) },
  graphic10: { freqs: GRAPHIC10_FREQS, baseQ: octaveQ(1) },
  graphic31: { freqs: GRAPHIC31_FREQS, baseQ: octaveQ(1 / 3) },
};

/** Faixa dos sliders do modo gráfico (dB). */
export const GRAPHIC_RANGE_DB = 12;
/** Faixa dos knobs do tone stack (dB). Knob 0–10 → −12…+12 dB, 5 = flat. */
export const TONESTACK_RANGE_DB = 12;
/** Faixa do tilt (dB nas extremidades). */
export const TILT_RANGE_DB = 6;

export const TONESTACK = {
  bass: { freq: 120, q: Math.SQRT1_2 },
  midFreqs: [250, 400, 600, 800, 1200, 2000, 3000],
  midQ: 0.8,
  treble: { freq: 2500, q: Math.SQRT1_2 },
  presence: { freq: 4500, q: 1.0 },
} as const;

export const TILT_PIVOTS = [400, 800, 1600];
/** Q baixo = transição suave (inclinação ao longo de várias oitavas). */
export const TILT_SHELF_Q = 0.5;

export const DEFAULT_HPF = 80;
export const DEFAULT_LPF = 10000;
