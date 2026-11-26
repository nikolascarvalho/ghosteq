// Leitura de arquivos WAV (para importar IR de caixa e gravações).
// Aceita PCM 8/16/24/32-bit, float 32/64-bit e WAVE_FORMAT_EXTENSIBLE.
// Ignora chunks desconhecidos (LIST, bext, cue…), como fazem os players.

export interface DecodedWav {
  sampleRate: number;
  /** Um Float64Array por canal, valores normalizados (PCM em [-1, 1)). */
  channels: Float64Array[];
  bitsPerSample: number;
  isFloat: boolean;
}

export class WavDecodeError extends Error {
  constructor(
    public readonly code: 'not-riff' | 'no-fmt' | 'no-data' | 'unsupported-format',
    message: string,
  ) {
    super(message);
    this.name = 'WavDecodeError';
  }
}

const readAscii = (v: DataView, o: number, n: number) =>
  String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(o + i)));

export function decodeWav(buffer: ArrayBuffer): DecodedWav {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12 || readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    throw new WavDecodeError('not-riff', 'Arquivo não é um WAV (RIFF/WAVE).');
  }

  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
  let dataOffset = -1;
  let dataSize = 0;

  let p = 12;
  while (p + 8 <= buffer.byteLength) {
    const id = readAscii(view, p, 4);
    const size = view.getUint32(p + 4, true);
    const body = p + 8;
    if (id === 'fmt ') {
      let format = view.getUint16(body, true);
      if (format === 0xfffe && size >= 26) format = view.getUint16(body + 24, true); // EXTENSIBLE: subformato
      fmt = {
        format,
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      dataOffset = body;
      // Alguns gravadores escrevem tamanho 0/inválido quando o arquivo não foi finalizado.
      dataSize = Math.min(size, buffer.byteLength - body);
      break;
    }
    p = body + size + (size % 2); // chunks têm tamanho par (byte de padding)
  }

  if (!fmt) throw new WavDecodeError('no-fmt', 'WAV sem chunk "fmt ".');
  if (dataOffset < 0) throw new WavDecodeError('no-data', 'WAV sem chunk "data".');

  const { format, channels: nCh, sampleRate, bits } = fmt;
  const isFloat = format === 3;
  if (!(format === 1 || isFloat) || nCh < 1) {
    throw new WavDecodeError('unsupported-format', `Formato WAV não suportado (código ${format}).`);
  }
  if (isFloat ? bits !== 32 && bits !== 64 : ![8, 16, 24, 32].includes(bits)) {
    throw new WavDecodeError('unsupported-format', `Profundidade não suportada: ${bits} bits.`);
  }

  const bytes = bits / 8;
  const frames = Math.floor(dataSize / (bytes * nCh));
  const channels = Array.from({ length: nCh }, () => new Float64Array(frames));
  let o = dataOffset;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nCh; c++) {
      let v: number;
      if (isFloat) v = bits === 32 ? view.getFloat32(o, true) : view.getFloat64(o, true);
      else if (bits === 8) v = (view.getUint8(o) - 128) / 128;
      else if (bits === 16) v = view.getInt16(o, true) / 32768;
      else if (bits === 24) {
        let s = view.getUint8(o) | (view.getUint8(o + 1) << 8) | (view.getUint8(o + 2) << 16);
        if (s & 0x800000) s -= 0x1000000;
        v = s / 8388608;
      } else v = view.getInt32(o, true) / 2147483648;
      channels[c]![i] = v;
      o += bytes;
    }
  }
  return { sampleRate, channels, bitsPerSample: bits, isFloat };
}

export type DownmixMode = 'left' | 'mix';

/**
 * Estéreo → mono. 'left' usa só o canal esquerdo; 'mix' faz a MÉDIA dos canais
 * (média, não soma, para não ganhar +6 dB quando L e R são iguais).
 */
export function downmix(channels: Float64Array[], mode: DownmixMode): Float64Array {
  if (channels.length === 1 || mode === 'left') return Float64Array.from(channels[0]!);
  const n = channels[0]!.length;
  const out = new Float64Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i]! += ch[i]!;
  for (let i = 0; i < n; i++) out[i]! /= channels.length;
  return out;
}
