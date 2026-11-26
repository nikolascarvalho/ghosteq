// Coeficientes de biquad pelo "Audio EQ Cookbook" de Robert Bristow-Johnson (RBJ),
// a referência padrão da indústria para EQs digitais.
import type { Biquad, FilterSpec } from './types';

/** Q das duas seções de um Butterworth de 4ª ordem (24 dB/oitava). */
const BUTTERWORTH4_Q = [0.5411961001461969, 1.3065629648763766] as const;
const BUTTERWORTH2_Q = Math.SQRT1_2;

function normalize(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): Biquad {
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function clampFreq(freq: number, fs: number): number {
  return Math.min(Math.max(freq, 1), fs * 0.4999);
}

export function peaking(freq: number, gainDb: number, q: number, fs: number): Biquad {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * clampFreq(freq, fs)) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  return normalize(1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A);
}

export function lowShelf(freq: number, gainDb: number, q: number, fs: number): Biquad {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * clampFreq(freq, fs)) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const k = 2 * Math.sqrt(A) * alpha;
  return normalize(
    A * (A + 1 - (A - 1) * cos + k),
    2 * A * (A - 1 - (A + 1) * cos),
    A * (A + 1 - (A - 1) * cos - k),
    A + 1 + (A - 1) * cos + k,
    -2 * (A - 1 + (A + 1) * cos),
    A + 1 + (A - 1) * cos - k,
  );
}

export function highShelf(freq: number, gainDb: number, q: number, fs: number): Biquad {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * clampFreq(freq, fs)) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const k = 2 * Math.sqrt(A) * alpha;
  return normalize(
    A * (A + 1 + (A - 1) * cos + k),
    -2 * A * (A - 1 + (A + 1) * cos),
    A * (A + 1 + (A - 1) * cos - k),
    A + 1 - (A - 1) * cos + k,
    2 * (A - 1 - (A + 1) * cos),
    A + 1 - (A - 1) * cos - k,
  );
}

export function lowPass(freq: number, q: number, fs: number): Biquad {
  const w0 = (2 * Math.PI * clampFreq(freq, fs)) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  return normalize((1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha);
}

export function highPass(freq: number, q: number, fs: number): Biquad {
  const w0 = (2 * Math.PI * clampFreq(freq, fs)) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  return normalize((1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha);
}

export function notch(freq: number, q: number, fs: number): Biquad {
  const w0 = (2 * Math.PI * clampFreq(freq, fs)) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  return normalize(1, -2 * cos, 1, 1 + alpha, -2 * cos, 1 - alpha);
}

/**
 * Converte um filtro "musical" em seções biquad.
 * - peak/shelf com 0 dB não geram seção (não alteram nada).
 * - 24 dB/oitava = 2 seções (Butterworth de 4ª ordem quando q = 0,707;
 *   outros q escalam as duas seções proporcionalmente, dando ressonância).
 */
export function designFilter(spec: FilterSpec, fs: number): Biquad[] {
  const { type, freq, gainDb, q } = spec;
  const safeQ = Math.max(q, 0.025);
  switch (type) {
    case 'peak':
      return gainDb === 0 ? [] : [peaking(freq, gainDb, safeQ, fs)];
    case 'lowshelf':
      return gainDb === 0 ? [] : [lowShelf(freq, gainDb, safeQ, fs)];
    case 'highshelf':
      return gainDb === 0 ? [] : [highShelf(freq, gainDb, safeQ, fs)];
    case 'hpf12':
      return [highPass(freq, safeQ, fs)];
    case 'lpf12':
      return [lowPass(freq, safeQ, fs)];
    case 'hpf24':
      return BUTTERWORTH4_Q.map((bq) => highPass(freq, (bq * safeQ) / BUTTERWORTH2_Q, fs));
    case 'lpf24':
      return BUTTERWORTH4_Q.map((bq) => lowPass(freq, (bq * safeQ) / BUTTERWORTH2_Q, fs));
    case 'notch':
      return [notch(freq, safeQ, fs)];
  }
}

/** Junta vários filtros numa única cascata. */
export function designCascade(specs: FilterSpec[], fs: number): Biquad[] {
  return specs.flatMap((s) => designFilter(s, fs));
}

/** |H(f)|² de uma seção, avaliado analiticamente em z = e^{jω}. */
export function biquadMagnitudeSquared(c: Biquad, freq: number, fs: number): number {
  const w = (2 * Math.PI * freq) / fs;
  const cos1 = Math.cos(w);
  const sin1 = Math.sin(w);
  const cos2 = Math.cos(2 * w);
  const sin2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * cos1 + c.b2 * cos2;
  const ni = -(c.b1 * sin1 + c.b2 * sin2);
  const dr = 1 + c.a1 * cos1 + c.a2 * cos2;
  const di = -(c.a1 * sin1 + c.a2 * sin2);
  return (nr * nr + ni * ni) / (dr * dr + di * di);
}
