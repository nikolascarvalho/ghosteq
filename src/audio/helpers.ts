// Funções puras usadas pelo motor de áudio (testáveis sem navegador).
import type { UsbChannelMap } from '../config/devices';

/** Taxa de amostragem do motor e dos aparelhos (Nano/Helix). */
export const ENGINE_SAMPLE_RATE = 48000;
/** Teto de saída: −1 dBFS (decisão do projeto). */
export const OUTPUT_CEILING_DB = -1;
/** Volume inicial toda vez que o áudio é ligado. */
export const START_VOLUME_DB = -12;
/** Tempo do crossfade A/B e da troca de IR (s). */
export const CROSSFADE_S = 0.02;

export const dbToLin = (db: number) => Math.pow(10, db / 20);
export const linToDb = (g: number) => (g > 0 ? 20 * Math.log10(g) : -Infinity);

/**
 * Curva do WaveShaper que faz o "hard clip" (só no fallback sem AudioWorklet;
 * o limiter normal faz o clip dentro do worklet): tudo acima do teto vira o teto.
 * O WaveShaper mapeia entrada [−1, 1] → curva; entradas além de ±1 usam as
 * pontas da curva, que já estão no teto. Resultado: nada sai acima de −1 dBFS.
 */
export function hardClipCurve(ceilingDb = OUTPUT_CEILING_DB, size = 4097): Float32Array<ArrayBuffer> {
  const c = dbToLin(ceilingDb);
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.max(-c, Math.min(c, x));
  }
  return curve;
}

/** O nome do dispositivo parece ser um Neural DSP (Nano/Quad Cortex)? */
export const isNanoLabel = (label: string) => /nano|cortex|neural/i.test(label);

/** RMS de um bloco de amostras. */
export function rms(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]! * x[i]!;
  return x.length ? Math.sqrt(s / x.length) : 0;
}

/**
 * Ganho de compensação de volume do caminho B (com IR) para soar tão alto
 * quanto o A (original): razão dos RMS, limitada a ±18 dB. Com sinal muito
 * baixo (silêncio) devolve null = "mantenha o ganho atual".
 */
export function loudnessCompensation(rmsDry: number, rmsWet: number, floorDb = -60): number | null {
  if (linToDb(rmsDry) < floorDb || linToDb(rmsWet) < floorDb) return null;
  const g = rmsDry / rmsWet;
  return Math.min(dbToLin(18), Math.max(dbToLin(-18), g));
}

/** Uma opção do seletor de canais de entrada: canais 0-based que são somados (média). */
export interface ChannelOption {
  id: string;
  channels: number[];
}

/** Opções: cada canal sozinho e cada par (1+2, 3+4…). */
export function channelOptions(channelCount: number): ChannelOption[] {
  const out: ChannelOption[] = [];
  for (let c = 0; c < channelCount; c++) out.push({ id: `${c + 1}`, channels: [c] });
  for (let c = 0; c + 1 < channelCount; c += 2) out.push({ id: `${c + 1}+${c + 2}`, channels: [c, c + 1] });
  return out;
}

/**
 * Seleção inicial: se o aparelho tem mapeamento USB conhecido (Nano: processado
 * = 3/4) e os canais existem, usa esse; senão o par 1+2 (ou o canal 1).
 */
export function defaultChannelSelection(channelCount: number, usb?: UsbChannelMap): string {
  const opts = channelOptions(channelCount);
  const processed = usb?.processed;
  if (processed?.length) {
    const id = processed.join('+');
    if (opts.some((o) => o.id === id)) return id;
  }
  return opts.find((o) => o.id === '1+2')?.id ?? opts[0]?.id ?? '1';
}
