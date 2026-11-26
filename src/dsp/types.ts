// Tipos do núcleo DSP. Nada aqui conhece React, DOM ou Web Audio.

/**
 * Uma seção biquad (filtro de 2ª ordem) já normalizada (a0 = 1):
 *   y[n] = b0·x[n] + b1·x[n-1] + b2·x[n-2] − a1·y[n-1] − a2·y[n-2]
 * Toda curva de EQ do app vira uma lista (cascata) dessas seções.
 */
export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export type FilterType = 'peak' | 'lowshelf' | 'highshelf' | 'hpf12' | 'hpf24' | 'lpf12' | 'lpf24' | 'notch';

/** Descrição de um filtro em termos "musicais" (o que o usuário edita). */
export interface FilterSpec {
  type: FilterType;
  /** Frequência central/de corte em Hz. */
  freq: number;
  /** Ganho em dB (ignorado em HPF/LPF/notch). */
  gainDb: number;
  /** Fator de qualidade (largura). 0,707 = Butterworth em HPF/LPF. */
  q: number;
}

/** Resultado da geração de um IR. */
export interface IrResult {
  /** IR final, já truncado com fade, no tamanho do aparelho. É o que se exporta. */
  ir: Float64Array;
  /** IR longo sem truncar (referência da curva "ideal"). */
  irLong: Float64Array;
  /** Maior |amostra| do IR final. > 1.0 exige WAV float. */
  peak: number;
}
