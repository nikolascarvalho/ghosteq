// Escrita de arquivos WAV (RIFF). Um WAV é um cabeçalho de 44–58 bytes que
// descreve o formato (taxa, bits, canais) seguido das amostras cruas.
// Analogia: é um Parquet bem simples — schema no cabeçalho, dados em sequência.

export type WavSampleFormat = 'pcm16' | 'pcm24' | 'float32';

export interface WavEncodeOptions {
  sampleRate: number;
  format: WavSampleFormat;
}

const WAVE_FORMAT_PCM = 1;
const WAVE_FORMAT_IEEE_FLOAT = 3;

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/**
 * Codifica áudio em WAV. `channels` é uma lista de canais (mono = [samples]).
 * - PCM inteiro: amostras fora de [-1, 1] são CLIPADAS (perda!). Use float32
 *   quando o pico passa de 1.0 — veja `chooseExportFormat`.
 * - float32: guarda o valor exato, inclusive > 1.0 (ex.: IR com +9 dB).
 */
export function encodeWav(channels: ArrayLike<number>[], opts: WavEncodeOptions): ArrayBuffer {
  const numChannels = channels.length;
  if (numChannels === 0) throw new Error('encodeWav: nenhum canal');
  const frames = channels[0]!.length;
  if (channels.some((c) => c.length !== frames)) throw new Error('encodeWav: canais de tamanhos diferentes');

  const isFloat = opts.format === 'float32';
  const bits = opts.format === 'pcm16' ? 16 : opts.format === 'pcm24' ? 24 : 32;
  const bytesPerSample = bits / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = frames * blockAlign;
  // Formatos não-PCM: chunk fmt de 18 bytes (com cbSize) + chunk "fact" (exigido pela especificação).
  const fmtSize = isFloat ? 18 : 16;
  const factSize = isFloat ? 12 : 0;
  const headerSize = 12 + (8 + fmtSize) + factSize + 8;
  const buffer = new ArrayBuffer(headerSize + dataSize + (dataSize % 2));
  const view = new DataView(buffer);

  let p = 0;
  writeAscii(view, p, 'RIFF');
  view.setUint32(p + 4, buffer.byteLength - 8, true);
  writeAscii(view, p + 8, 'WAVE');
  p += 12;

  writeAscii(view, p, 'fmt ');
  view.setUint32(p + 4, fmtSize, true);
  view.setUint16(p + 8, isFloat ? WAVE_FORMAT_IEEE_FLOAT : WAVE_FORMAT_PCM, true);
  view.setUint16(p + 10, numChannels, true);
  view.setUint32(p + 12, opts.sampleRate, true);
  view.setUint32(p + 16, opts.sampleRate * blockAlign, true);
  view.setUint16(p + 20, blockAlign, true);
  view.setUint16(p + 22, bits, true);
  if (isFloat) view.setUint16(p + 24, 0, true); // cbSize
  p += 8 + fmtSize;

  if (isFloat) {
    writeAscii(view, p, 'fact');
    view.setUint32(p + 4, 4, true);
    view.setUint32(p + 8, frames, true);
    p += 12;
  }

  writeAscii(view, p, 'data');
  view.setUint32(p + 4, dataSize, true);
  p += 8;

  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const v = channels[c]![i]!;
      if (isFloat) {
        view.setFloat32(p, v, true);
      } else if (bits === 16) {
        // Escala simétrica com o decoder (÷ 2^15); +1.0 vira o maior código (32767).
        const s = Math.max(-32768, Math.min(32767, Math.round(v * 32768)));
        view.setInt16(p, s, true);
      } else {
        const s = Math.max(-8388608, Math.min(8388607, Math.round(v * 8388608)));
        view.setUint8(p, s & 0xff);
        view.setUint8(p + 1, (s >> 8) & 0xff);
        view.setUint8(p + 2, (s >> 16) & 0xff);
      }
      p += bytesPerSample;
    }
  }
  return buffer;
}

export interface ExportFormatChoice {
  format: WavSampleFormat;
  /** true quando o usuário pediu PCM mas o pico obrigou a usar float. */
  forcedFloat: boolean;
}

/**
 * Regra de exportação: pico > 1.0 estoura em PCM inteiro, então força float32
 * (e a UI avisa). Senão respeita a preferência (padrão: 24-bit PCM).
 */
export function chooseExportFormat(peak: number, preferred: WavSampleFormat = 'pcm24'): ExportFormatChoice {
  if (peak > 1 && preferred !== 'float32') return { format: 'float32', forcedFloat: true };
  return { format: preferred, forcedFloat: false };
}
