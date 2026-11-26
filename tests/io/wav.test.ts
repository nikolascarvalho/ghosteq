import { describe, expect, it } from 'vitest';
import { buildIr, designCascade } from '../../src/dsp';
import { decodeWav, downmix, WavDecodeError } from '../../src/io/wavDecode';
import { chooseExportFormat, encodeWav } from '../../src/io/wavEncode';
import { whiteNoise } from '../helpers';

const ascii = (v: DataView, o: number, n: number) =>
  String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(o + i)));

describe('WAV encoder', () => {
  it('PCM 24-bit: cabeçalho correto', () => {
    const buf = encodeWav([new Float64Array(1024)], { sampleRate: 48000, format: 'pcm24' });
    const v = new DataView(buf);
    expect(ascii(v, 0, 4)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(buf.byteLength - 8);
    expect(ascii(v, 8, 4)).toBe('WAVE');
    expect(ascii(v, 12, 4)).toBe('fmt ');
    expect(v.getUint32(16, true)).toBe(16); // tamanho do fmt
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(28, true)).toBe(48000 * 3); // byte rate
    expect(v.getUint16(32, true)).toBe(3); // block align
    expect(v.getUint16(34, true)).toBe(24);
    expect(ascii(v, 36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(1024 * 3);
    expect(buf.byteLength).toBe(44 + 1024 * 3);
  });

  it('float 32-bit: cabeçalho correto com fmt de 18 bytes e chunk fact', () => {
    const buf = encodeWav([new Float64Array(1024)], { sampleRate: 48000, format: 'float32' });
    const v = new DataView(buf);
    expect(v.getUint32(16, true)).toBe(18);
    expect(v.getUint16(20, true)).toBe(3); // IEEE float
    expect(v.getUint16(34, true)).toBe(32);
    expect(v.getUint16(36, true)).toBe(0); // cbSize
    expect(ascii(v, 38, 4)).toBe('fact');
    expect(v.getUint32(46, true)).toBe(1024); // nº de frames
    expect(ascii(v, 50, 4)).toBe('data');
    expect(v.getUint32(54, true)).toBe(1024 * 4);
  });

  it('PCM 24-bit: ida e volta com erro menor que 1 LSB', () => {
    const x = whiteNoise(4096, 9).map((s) => s * 0.9);
    const back = decodeWav(encodeWav([x], { sampleRate: 48000, format: 'pcm24' }));
    expect(back.sampleRate).toBe(48000);
    expect(back.bitsPerSample).toBe(24);
    expect(back.isFloat).toBe(false);
    for (let i = 0; i < x.length; i++)
      expect(Math.abs(back.channels[0]![i]! - x[i]!)).toBeLessThan(1 / 2 ** 23);
  });

  it('PCM 16-bit: ida e volta com erro menor que 1 LSB', () => {
    const x = whiteNoise(512, 4).map((s) => s * 0.5);
    const back = decodeWav(encodeWav([x], { sampleRate: 44100, format: 'pcm16' }));
    expect(back.sampleRate).toBe(44100);
    for (let i = 0; i < x.length; i++)
      expect(Math.abs(back.channels[0]![i]! - x[i]!)).toBeLessThan(1 / 2 ** 15);
  });

  it('PCM clipa valores acima de 1.0 (por isso existe o float)', () => {
    const back = decodeWav(encodeWav([[2.5, -3]], { sampleRate: 48000, format: 'pcm24' }));
    expect(back.channels[0]![0]).toBeCloseTo(1, 5);
    expect(back.channels[0]![1]).toBeCloseTo(-1, 5);
  });

  it('IR de +9 dB: exportação automática em float preserva o pico 2,818', () => {
    const { ir, peak } = buildIr(designCascade([{ type: 'peak', freq: 3000, gainDb: -5, q: 1.4 }], 48000), {
      length: 1024,
      gainDb: 9,
    });
    const choice = chooseExportFormat(peak);
    expect(choice).toEqual({ format: 'float32', forcedFloat: true });
    const back = decodeWav(encodeWav([ir], { sampleRate: 48000, format: choice.format }));
    expect(back.isFloat).toBe(true);
    expect(back.channels[0]![0]).toBeCloseTo(ir[0]!, 6);
    expect(Math.max(...back.channels[0]!.map(Math.abs))).toBeCloseTo(peak, 5);
  });

  it('escolha de formato: pico ≤ 1 respeita a preferência (padrão 24-bit)', () => {
    expect(chooseExportFormat(1)).toEqual({ format: 'pcm24', forcedFloat: false });
    expect(chooseExportFormat(0.5, 'float32')).toEqual({ format: 'float32', forcedFloat: false });
    expect(chooseExportFormat(2, 'float32')).toEqual({ format: 'float32', forcedFloat: false });
  });

  it('estéreo: canais intercalados corretamente', () => {
    const back = decodeWav(
      encodeWav(
        [
          [0.5, 0.25],
          [-0.5, -0.25],
        ],
        { sampleRate: 48000, format: 'float32' },
      ),
    );
    expect(back.channels).toHaveLength(2);
    expect(Array.from(back.channels[0]!)).toEqual([0.5, 0.25]);
    expect(Array.from(back.channels[1]!)).toEqual([-0.5, -0.25]);
  });

  it('recusa canais de tamanhos diferentes', () => {
    expect(() => encodeWav([[1, 2], [1]], { sampleRate: 48000, format: 'pcm16' })).toThrow();
  });
});

/** Monta um WAV "na mão" para testar casos que o nosso encoder não gera. */
function handWav(chunks: { id: string; body: Uint8Array }[]): ArrayBuffer {
  const size = 12 + chunks.reduce((s, c) => s + 8 + c.body.length + (c.body.length % 2), 0);
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, size - 8, true);
  w(8, 'WAVE');
  let p = 12;
  for (const c of chunks) {
    w(p, c.id);
    v.setUint32(p + 4, c.body.length, true);
    new Uint8Array(buf, p + 8, c.body.length).set(c.body);
    p += 8 + c.body.length + (c.body.length % 2);
  }
  return buf;
}

function fmtBody(format: number, channels: number, rate: number, bits: number, extensibleSub?: number) {
  const ext = extensibleSub !== undefined;
  const body = new Uint8Array(ext ? 40 : 16);
  const v = new DataView(body.buffer);
  v.setUint16(0, format, true);
  v.setUint16(2, channels, true);
  v.setUint32(4, rate, true);
  v.setUint32(8, (rate * channels * bits) / 8, true);
  v.setUint16(12, (channels * bits) / 8, true);
  v.setUint16(14, bits, true);
  if (ext) {
    v.setUint16(16, 22, true);
    v.setUint16(24, extensibleSub, true);
  }
  return body;
}

describe('WAV decoder', () => {
  it('pula chunks desconhecidos de tamanho ímpar (LIST) e lê o data', () => {
    const data = new Uint8Array(4);
    new DataView(data.buffer).setInt16(0, 16384, true);
    const buf = handWav([
      { id: 'fmt ', body: fmtBody(1, 1, 44100, 16) },
      { id: 'LIST', body: new Uint8Array(5) },
      { id: 'data', body: data },
    ]);
    const d = decodeWav(buf);
    expect(d.sampleRate).toBe(44100);
    expect(d.channels[0]![0]).toBeCloseTo(0.5, 6);
    expect(d.channels[0]).toHaveLength(2);
  });

  it('lê WAVE_FORMAT_EXTENSIBLE com subformato float', () => {
    const data = new Uint8Array(4);
    new DataView(data.buffer).setFloat32(0, 1.5, true);
    const d = decodeWav(
      handWav([
        { id: 'fmt ', body: fmtBody(0xfffe, 1, 96000, 32, 3) },
        { id: 'data', body: data },
      ]),
    );
    expect(d.isFloat).toBe(true);
    expect(d.sampleRate).toBe(96000);
    expect(d.channels[0]![0]).toBe(1.5);
  });

  it('erros claros para arquivos inválidos', () => {
    expect(() => decodeWav(new ArrayBuffer(10))).toThrow(WavDecodeError);
    expect(() => decodeWav(handWav([{ id: 'data', body: new Uint8Array(2) }]))).toThrow(/fmt/);
    expect(() =>
      decodeWav(
        handWav([
          { id: 'fmt ', body: fmtBody(2, 1, 48000, 4) },
          { id: 'data', body: new Uint8Array(2) },
        ]),
      ),
    ).toThrow(/não suportado/);
  });

  it('downmix: L ou média dos canais', () => {
    const ch = [Float64Array.from([1, 0.5]), Float64Array.from([0, 0.5])];
    expect(Array.from(downmix(ch, 'left'))).toEqual([1, 0.5]);
    expect(Array.from(downmix(ch, 'mix'))).toEqual([0.5, 0.5]);
  });
});
