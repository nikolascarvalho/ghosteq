import { describe, expect, it } from 'vitest';
import { PeakLimiterCore } from '../../src/audio/worklets/safety-limiter.worklet.js';
import { dbToLin, OUTPUT_CEILING_DB } from '../../src/audio/helpers';

const SR = 48000;
const CEIL = dbToLin(OUTPUT_CEILING_DB);

/** Roda o limiter em blocos de 128 (como o navegador) e devolve a saída. */
function run(x: Float32Array, lim = new PeakLimiterCore(SR), block = 128): Float32Array {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += block) {
    const n = Math.min(block, x.length - i);
    const o = new Float32Array(n);
    lim.process([x.subarray(i, i + n)], [o], n);
    out.set(o, i);
  }
  return out;
}

const argmaxAbs = (x: Float32Array) => {
  let k = 0;
  for (let i = 1; i < x.length; i++) if (Math.abs(x[i]!) > Math.abs(x[k]!)) k = i;
  return k;
};

describe('limiter sem lookahead (AudioWorklet)', () => {
  it('atraso = 0 amostras: o impulso sai na mesma posição em que entrou', () => {
    for (const pos of [0, 1, 127, 128, 1000]) {
      const x = new Float32Array(2048);
      x[pos] = 0.5;
      const y = run(x);
      expect(argmaxAbs(y)).toBe(pos);
      expect(y[pos]).toBe(0.5); // ganho unitário: igual bit a bit
    }
  });

  it('impulso enorme (+29 dBFS) também sai na mesma posição, no teto', () => {
    const x = new Float32Array(2048);
    x[777] = dbToLin(29);
    const y = run(x);
    expect(argmaxAbs(y)).toBe(777);
    expect(y[777]).toBeCloseTo(CEIL, 6);
    expect(y.slice(0, 777).every((v) => v === 0)).toBe(true);
  });

  it('teto de −1 dBFS respeitado com +29 dBFS na entrada', () => {
    const g = dbToLin(29);
    const x = Float32Array.from({ length: SR }, (_, i) => {
      // senoide + ruído pseudoaleatório + degraus: tudo bem acima do teto
      const noise = Math.sin(i * 12.9898) * 43758.5453;
      return g * (0.6 * Math.sin((2 * Math.PI * 220 * i) / SR) + 0.4 * (noise - Math.floor(noise) - 0.5));
    });
    const y = run(x);
    const peak = y.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeLessThanOrEqual(CEIL + 1e-7);
    expect(peak).toBeGreaterThan(CEIL * 0.99);
  });

  it('sinal abaixo do limiar passa idêntico (ganho exatamente 1)', () => {
    const x = Float32Array.from({ length: 4800 }, (_, i) => 0.8 * Math.sin((2 * Math.PI * 440 * i) / SR));
    const y = run(x);
    expect(Array.from(y)).toEqual(Array.from(x));
  });

  it('release ~50 ms: depois de um pico o ganho volta a 1', () => {
    const lim = new PeakLimiterCore(SR);
    const x = new Float32Array(SR / 2);
    x[0] = 4; // ganho cai para limiar/4
    run(x.subarray(0, 1), lim);
    const g0 = lim.gain;
    expect(g0).toBeCloseTo(CEIL / 4, 6);
    run(new Float32Array(SR * 0.05), lim); // 50 ms de silêncio
    // após uma constante de tempo, falta 1/e da distância até 1
    expect(1 - lim.gain).toBeCloseTo((1 - g0) / Math.E, 3);
    run(new Float32Array(SR), lim);
    expect(lim.gain).toBe(1);
  });

  it('o tamanho do bloco não muda o resultado', () => {
    const x = Float32Array.from({ length: 3000 }, (_, i) => 3 * Math.sin(i / 7) * Math.sin(i / 300));
    const a = run(x, new PeakLimiterCore(SR), 128);
    const b = run(x, new PeakLimiterCore(SR), 3000);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('NaN e Infinity viram silêncio, sem estourar', () => {
    const x = new Float32Array([0.1, NaN, Infinity, -Infinity, 0.1]);
    const y = run(x);
    expect(y.every((v) => Number.isFinite(v) && Math.abs(v) <= CEIL)).toBe(true);
    expect(y[1]).toBe(0);
  });

  it('estéreo: mesmo ganho nos dois canais', () => {
    const lim = new PeakLimiterCore(SR);
    const l = new Float32Array([2, 0.5]);
    const r = new Float32Array([0.5, 0.5]);
    const ol = new Float32Array(2);
    const or = new Float32Array(2);
    lim.process([l, r], [ol, or], 2);
    expect(ol[0]! / or[0]!).toBeCloseTo(4, 6);
  });
});
