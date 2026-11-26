// Gera IRs de teste em ./test-irs/ usando o MESMO código do app (src/dsp + src/io).
// Uso: npm run make-test-irs
// Serve para validar no aparelho (Cortex Cloud / HX Edit) que os WAVs são aceitos
// e soam como esperado, antes de existir a interface do editor.
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const dsp = await server.ssrLoadModule('/src/dsp/index.ts');
  const { encodeWav, chooseExportFormat } = await server.ssrLoadModule('/src/io/wavEncode.ts');
  const { exportFileName } = await server.ssrLoadModule('/src/io/fileName.ts');
  const { getDevicePreset } = await server.ssrLoadModule('/src/config/devices.ts');

  const cases = [
    { note: 'flat: deve soar IDÊNTICO a IR desligado', bands: [], gain: 0 },
    { note: 'corte de médio em 3 kHz', bands: [{ type: 'peak', freq: 3000, gainDb: -5, q: 1.4 }], gain: 0 },
    {
      note: 'corte em 3 kHz + 9 dB de volume (float 32-bit)',
      bands: [{ type: 'peak', freq: 3000, gainDb: -5, q: 1.4 }],
      gain: 9,
    },
    { note: 'só +6 dB de volume, sem EQ (float 32-bit)', bands: [], gain: 6 },
    {
      note: 'HPF 100 Hz + agudo -4 dB (24-bit)',
      bands: [
        { type: 'hpf24', freq: 100, gainDb: 0, q: 0.707 },
        { type: 'highshelf', freq: 5000, gainDb: -4, q: 0.707 },
      ],
      gain: 0,
    },
  ];

  await mkdir('test-irs', { recursive: true });
  for (const deviceId of ['nano-cortex', 'helix']) {
    const device = getDevicePreset(deviceId);
    for (const c of cases) {
      const bands = c.bands.map((b, i) => ({ ...b, id: `b${i}`, enabled: true }));
      const sections = dsp.designCascade(bands, device.sampleRate);
      const { ir, peak } = dsp.buildIr(sections, { length: device.irLength, gainDb: c.gain });
      const { format } = chooseExportFormat(peak);
      const curve = {
        schemaVersion: 1,
        mode: 'parametric',
        bands,
        outputGainDb: c.gain,
        devicePresetId: deviceId,
      };
      const name = exportFileName(curve, device);
      await writeFile(
        `test-irs/${name}`,
        Buffer.from(encodeWav([ir], { sampleRate: device.sampleRate, format })),
      );
      console.log(`${name.padEnd(44)} ${format.padEnd(8)} pico ${peak.toFixed(3)}  ${c.note}`);
    }
  }
} finally {
  await server.close();
}
