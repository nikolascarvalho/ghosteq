// Conversões entre o "mundo do áudio" (Hz, dB) e pixels do gráfico.
// Eixo X logarítmico (cada oitava ocupa a mesma largura), eixo Y linear em dB.

export const F_MIN = 20;
export const F_MAX = 20000;
export const DB_RANGE = 18;

export const FREQ_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
export const DB_TICKS = [-18, -12, -6, 0, 6, 12, 18];

export interface Viewport {
  width: number;
  height: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
}

export function makeViewport(width: number, height: number): Viewport {
  return { width, height, padL: 34, padR: 10, padT: 10, padB: 22 };
}

const LOG_SPAN = Math.log(F_MAX / F_MIN);
const plotW = (v: Viewport) => v.width - v.padL - v.padR;
const plotH = (v: Viewport) => v.height - v.padT - v.padB;

export function freqToX(f: number, v: Viewport): number {
  return v.padL + (Math.log(f / F_MIN) / LOG_SPAN) * plotW(v);
}

export function xToFreq(x: number, v: Viewport): number {
  const t = Math.min(1, Math.max(0, (x - v.padL) / plotW(v)));
  return F_MIN * Math.exp(t * LOG_SPAN);
}

export function dbToY(db: number, v: Viewport): number {
  return v.padT + ((DB_RANGE - db) / (2 * DB_RANGE)) * plotH(v);
}

export function yToDb(y: number, v: Viewport): number {
  const t = (y - v.padT) / plotH(v);
  return Math.min(DB_RANGE, Math.max(-DB_RANGE, DB_RANGE - t * 2 * DB_RANGE));
}

/**
 * Caminho SVG ("M x y L x y …") de uma curva. `offsetDb` é subtraído de todos os
 * pontos (usado para desenhar a forma do EQ sem o ganho de saída).
 * Valores fora da faixa são limitados um pouco além da borda (o clipPath corta).
 */
export function curvePath(
  freqs: ArrayLike<number>,
  db: ArrayLike<number>,
  v: Viewport,
  offsetDb = 0,
): string {
  const limit = DB_RANGE + 4;
  let d = '';
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i]!;
    if (f < F_MIN || f > F_MAX) continue;
    const val = Math.min(limit, Math.max(-limit, db[i]! - offsetDb));
    d += `${d ? 'L' : 'M'}${freqToX(f, v).toFixed(1)} ${dbToY(val, v).toFixed(1)}`;
  }
  return d;
}

/** Posição de 0..1 num slider logarítmico de frequência ↔ Hz. */
export const sliderToFreq = (t: number) => F_MIN * Math.exp(t * LOG_SPAN);
export const freqToSlider = (f: number) => Math.log(f / F_MIN) / LOG_SPAN;
