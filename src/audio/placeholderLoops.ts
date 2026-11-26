// Loops de exemplo PLACEHOLDER, sintetizados na hora (só em desenvolvimento).
// Os loops reais (gravados pelo usuário no Nano) ficam em public/samples/ e
// têm prioridade. Isto NÃO imita um amp de verdade: serve para testar o app.
//
// Receita: cordas "dedilhadas" (algoritmo Karplus-Strong) → saturação (tanh)
// → filtro de "caixa" (HPF + médio + LPF). Já vem "amplificado", como pede o
// projeto (o IR fica depois do amp, então o exemplo nunca é DI crua).
import { designCascade, filterCascade } from '../dsp';

export type LoopStyle = 'clean' | 'crunch' | 'highgain';
export const LOOP_STYLES: LoopStyle[] = ['clean', 'crunch', 'highgain'];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uma corda: ruído num buffer circular com média (passa-baixa) e decaimento. */
function pluck(
  out: Float64Array,
  start: number,
  freq: number,
  dur: number,
  fs: number,
  amp: number,
  rand: () => number,
) {
  const period = Math.max(2, Math.round(fs / freq));
  const buf = new Float64Array(period);
  for (let i = 0; i < period; i++) buf[i] = (rand() * 2 - 1) * amp;
  const n = Math.min(out.length - start, Math.round(dur * fs));
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const next = (idx + 1) % period;
    const v = buf[idx]!;
    buf[idx] = 0.4985 * (v + buf[next]!);
    out[start + i]! += v;
    idx = next;
  }
}

const NOTE = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export function synthLoop(style: LoopStyle, fs = 48000, seconds = 8): Float32Array {
  const out = new Float64Array(Math.round(fs * seconds));
  const rand = rng(style === 'clean' ? 1 : style === 'crunch' ? 2 : 3);
  const beat = 0.5; // 120 BPM

  if (style === 'clean') {
    // Arpejo de Em7 – Cmaj7 – G – D
    const chords = [
      [40, 47, 52, 55, 59, 62],
      [48, 52, 55, 59, 64],
      [43, 47, 50, 55, 59, 67],
      [50, 57, 62, 66, 69],
    ];
    for (let bar = 0; bar < 4; bar++) {
      const notes = chords[bar]!;
      for (let k = 0; k < 8; k++) {
        const t = (bar * 4 + k * 0.5) * beat;
        pluck(out, Math.round(t * fs), NOTE(notes[k % notes.length]!), 2.5, fs, 0.35, rand);
      }
    }
  } else {
    // Power chords E5 – G5 – A5 – G5, palhetada em colcheias
    const roots = [40, 43, 45, 43];
    for (let bar = 0; bar < 4; bar++) {
      const r = roots[bar]!;
      for (let k = 0; k < 8; k++) {
        const t = (bar * 4 + k * 0.5) * beat;
        const dur = style === 'highgain' && k % 2 === 1 ? 0.18 : 0.45; // "palm mute" alternado
        for (const n of [r, r + 7, r + 12]) pluck(out, Math.round(t * fs), NOTE(n), dur, fs, 0.3, rand);
      }
    }
  }

  // Saturação do "amp"
  const drive = style === 'clean' ? 1.2 : style === 'crunch' ? 5 : 22;
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i]! * drive);

  // "Caixa" simplificada
  const cab = designCascade(
    [
      { type: 'hpf12', freq: 80, gainDb: 0, q: 0.8 },
      { type: 'peak', freq: 2200, gainDb: 4, q: 1 },
      { type: 'lpf24', freq: 5500, gainDb: 0, q: 0.707 },
    ],
    fs,
  );
  const shaped = filterCascade(cab, out);

  // Normaliza o pico a −1 dBFS (mesmo padrão pedido para os loops reais)
  let peak = 0;
  for (let i = 0; i < shaped.length; i++) peak = Math.max(peak, Math.abs(shaped[i]!));
  const g = peak > 0 ? Math.pow(10, -1 / 20) / peak : 0;
  return Float32Array.from(shaped, (v) => v * g);
}
