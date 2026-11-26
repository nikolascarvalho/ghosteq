import type { Band } from '../../model/curve';

/** Cores das bandas (pela posição na lista). */
export const BAND_COLORS = [
  '#7c9cff',
  '#4fd1c5',
  '#f6ad55',
  '#f687b3',
  '#9ae6b4',
  '#fbd38d',
  '#b794f4',
  '#63b3ed',
];

export const bandColor = (index: number) => BAND_COLORS[index % BAND_COLORS.length]!;

/** Tipos em que o ganho faz sentido (os outros só têm frequência e Q). */
export function hasGain(type: Band['type']): boolean {
  return type === 'peak' || type === 'lowshelf' || type === 'highshelf';
}
