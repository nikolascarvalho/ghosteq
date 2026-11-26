// Nome automático e descritivo para o WAV exportado, ex.: EQ_3k-5dB_+9dB_Nano1024.wav
// Ajuda a achar o IR certo depois, na lista do Cortex Cloud / HX Edit.
import type { DevicePreset } from '../config/devices';
import { GRAPHIC_LAYOUTS } from '../dsp/modes';
import type { Band, CurveConfig } from '../model/curve';
import { graphicStateOf, isGraphicMode, tiltStateOf, toneStackStateOf } from '../model/modes';

const MAX_BANDS_IN_NAME = 3;
const MAX_LENGTH = 64;

/** 80 → "80", 1000 → "1k", 2500 → "2k5", 12000 → "12k". */
export function formatFreq(hz: number): string {
  if (hz < 1000) return String(Math.round(hz));
  const k = Math.round(hz / 100) / 10; // 1 casa decimal
  const [int, dec] = k.toFixed(1).split('.');
  return dec === '0' ? `${int}k` : `${int}k${dec}`;
}

/** 9 → "+9dB", -4.5 → "-4.5dB". */
export function formatGain(db: number): string {
  const r = Math.round(db * 10) / 10;
  return `${r > 0 ? '+' : ''}${r}dB`;
}

function bandToken(b: Band): string {
  switch (b.type) {
    case 'hpf12':
    case 'hpf24':
      return `HP${formatFreq(b.freq)}`;
    case 'lpf12':
    case 'lpf24':
      return `LP${formatFreq(b.freq)}`;
    case 'notch':
      return `N${formatFreq(b.freq)}`;
    case 'lowshelf':
      return `LS${formatFreq(b.freq)}${formatGain(b.gainDb)}`;
    case 'highshelf':
      return `HS${formatFreq(b.freq)}${formatGain(b.gainDb)}`;
    case 'peak':
      return `${formatFreq(b.freq)}${formatGain(b.gainDb)}`;
  }
}

/** Banda "importa" no nome se altera o som: filtros sempre; peak/shelf só com ganho ≠ 0. */
function isAudible(b: Band): boolean {
  if (!b.enabled) return false;
  return !['peak', 'lowshelf', 'highshelf'].includes(b.type) || Math.abs(b.gainDb) >= 0.05;
}

export interface FileNameOptions {
  /** Prefixo: "EQ" para EQ puro, "CAB+EQ" após juntar com caixa. */
  prefix?: string;
}

/** Até 3 itens de maior peso, em ordem de frequência, + contagem do resto. */
function topTokens<T>(items: T[], weight: (x: T) => number, freq: (x: T) => number, token: (x: T) => string) {
  const top = [...items]
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, MAX_BANDS_IN_NAME)
    .sort((a, b) => freq(a) - freq(b));
  const out = top.map(token);
  if (items.length > top.length) out.push(`+${items.length - top.length}`);
  return out;
}

const db = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? '+' : ''}${r}`;
};

/**
 * Tokens que descrevem a curva. Nos modos gráfico/tone stack/tilt o nome usa os
 * CONTROLES que o usuário mexeu (ex.: 1k-6), não as bandas internas compiladas
 * (que têm ganhos corrigidos e várias bandas pequenas de compensação).
 */
function curveTokens(curve: CurveConfig): string[] {
  const { mode, modeState } = curve;
  if (isGraphicMode(mode)) {
    const { freqs } = GRAPHIC_LAYOUTS[mode];
    const s = graphicStateOf(mode, modeState);
    const sliders = s.gainsDb.map((g, i) => ({ g, f: freqs[i]! })).filter((x) => Math.abs(x.g) >= 0.05);
    const tokens = topTokens(
      sliders,
      (x) => Math.abs(x.g),
      (x) => x.f,
      (x) => `${formatFreq(x.f)}${db(x.g)}`,
    );
    if (s.hpf.enabled) tokens.unshift(`HP${formatFreq(s.hpf.freq)}`);
    if (s.lpf.enabled) tokens.push(`LP${formatFreq(s.lpf.freq)}`);
    return [`GEQ${freqs.length}`, ...(tokens.length ? tokens : ['flat'])];
  }
  if (mode === 'tonestack') {
    const s = toneStackStateOf(modeState);
    const knobs: [string, number][] = [
      ['B', s.bassDb],
      [`M${formatFreq(s.midFreq)}`, s.midDb],
      ['T', s.trebleDb],
      ['P', s.presenceDb],
    ];
    const tokens = knobs.filter(([, v]) => Math.abs(v) >= 0.05).map(([k, v]) => `${k}${db(v)}`);
    if (s.hpf.enabled) tokens.unshift(`HP${formatFreq(s.hpf.freq)}`);
    if (s.lpf.enabled) tokens.push(`LP${formatFreq(s.lpf.freq)}`);
    return ['TS', ...(tokens.length ? tokens : ['flat'])];
  }
  if (mode === 'tilt') {
    const s = tiltStateOf(modeState);
    return Math.abs(s.tiltDb) < 0.05
      ? ['TILT', 'flat']
      : [`TILT${db(s.tiltDb)}dB`, `at${formatFreq(s.pivotHz)}`];
  }
  const audible = curve.bands.filter(isAudible);
  // As bandas de maior impacto primeiro (filtros de corte contam como 12 dB), depois por frequência.
  const weight = (b: Band) => (['peak', 'lowshelf', 'highshelf'].includes(b.type) ? Math.abs(b.gainDb) : 12);
  const tokens = topTokens(audible, weight, (b) => b.freq, bandToken);
  return ['EQ', ...(tokens.length ? tokens : ['flat'])];
}

export function exportFileName(curve: CurveConfig, device: DevicePreset, opts: FileNameOptions = {}): string {
  const [defaultPrefix, ...tokens] = curveTokens(curve);
  const parts = [opts.prefix ?? defaultPrefix!, ...tokens];
  if (Math.abs(curve.outputGainDb) >= 0.05) parts.push(formatGain(curve.outputGainDb));
  const deviceTag = `${device.shortName}${device.irLength}`;

  let base = parts.join('_').replace(/[^A-Za-z0-9+\-._]/g, '');
  const maxBase = MAX_LENGTH - deviceTag.length - '_.wav'.length;
  if (base.length > maxBase) base = base.slice(0, maxBase);
  return `${base}_${deviceTag}.wav`;
}
