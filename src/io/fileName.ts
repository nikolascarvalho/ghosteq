// Nome automático e descritivo para o WAV exportado, ex.: EQ_3k-5dB_+9dB_Nano1024.wav
// Ajuda a achar o IR certo depois, na lista do Cortex Cloud / HX Edit.
import type { DevicePreset } from '../config/devices';
import type { Band, CurveConfig } from '../model/curve';

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

export function exportFileName(curve: CurveConfig, device: DevicePreset, opts: FileNameOptions = {}): string {
  const audible = curve.bands.filter(isAudible);
  // As bandas de maior impacto primeiro (filtros de corte contam como 12 dB), depois por frequência.
  const weight = (b: Band) => (['peak', 'lowshelf', 'highshelf'].includes(b.type) ? Math.abs(b.gainDb) : 12);
  const top = [...audible]
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, MAX_BANDS_IN_NAME)
    .sort((a, b) => a.freq - b.freq);

  const parts = [opts.prefix ?? 'EQ'];
  if (top.length === 0) parts.push('flat');
  parts.push(...top.map(bandToken));
  if (audible.length > top.length) parts.push(`+${audible.length - top.length}`);
  if (Math.abs(curve.outputGainDb) >= 0.05) parts.push(formatGain(curve.outputGainDb));
  const deviceTag = `${device.shortName}${device.irLength}`;

  let base = parts.join('_').replace(/[^A-Za-z0-9+\-._]/g, '');
  const maxBase = MAX_LENGTH - deviceTag.length - '_.wav'.length;
  if (base.length > maxBase) base = base.slice(0, maxBase);
  return `${base}_${deviceTag}.wav`;
}
