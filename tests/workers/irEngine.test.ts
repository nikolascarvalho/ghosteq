import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultCurve, flatCurve, type CurveConfig } from '../../src/model/curve';
import { IrClient, type IrTransport } from '../../src/workers/dspClient';
import { computeIr, type IrComputation } from '../../src/workers/irEngine';

const withBand = (curve: CurveConfig, id: string, patch: object): CurveConfig => ({
  ...curve,
  bands: curve.bands.map((b) => (b.id === id ? { ...b, ...patch } : b)),
});

describe('motor do IR', () => {
  it('curva padrão gera IR flat (Dirac) no tamanho do Nano', () => {
    const r = computeIr({ id: 1, curve: defaultCurve('nano-cortex') });
    expect(r.sampleRate).toBe(48000);
    expect(r.length).toBe(1024);
    expect(r.ir[0]).toBe(1);
    expect(r.peak).toBe(1);
    expect(r.exportFormat).toEqual({ format: 'pcm24', forcedFloat: false });
    expect(r.deviation.maxAbsDb).toBeLessThan(0.01);
  });

  it('Helix usa 2048 amostras; Customizado usa os valores do usuário', () => {
    expect(computeIr({ id: 1, curve: flatCurve('helix') }).length).toBe(2048);
    const custom = { ...flatCurve('custom'), customDevice: { sampleRate: 44100, irLength: 512 } };
    const r = computeIr({ id: 1, curve: custom });
    expect(r.sampleRate).toBe(44100);
    expect(r.length).toBe(512);
  });

  it('+9 dB força float e as curvas sobem 9 dB', () => {
    const r = computeIr({ id: 1, curve: { ...flatCurve('nano-cortex'), outputGainDb: 9 } });
    expect(r.exportFormat).toEqual({ format: 'float32', forcedFloat: true });
    expect(r.targetDb[100]).toBeCloseTo(9, 6);
    expect(r.realDb[100]).toBeCloseTo(9, 3);
  });

  it('marca como imprecisa só a banda de grave estreita', () => {
    let curve = withBand(defaultCurve('nano-cortex'), 'low', { type: 'peak', freq: 40, gainDb: -10, q: 4 });
    curve = withBand(curve, 'highmid', { gainDb: -5, q: 1.4 });
    const r = computeIr({ id: 1, curve });
    const byId = Object.fromEntries(r.bandDeviations.map((d) => [d.bandId, d]));
    expect(byId.low!.imprecise).toBe(true);
    expect(byId.highmid!.imprecise).toBe(false);
    expect(r.deviation.regions.length).toBeGreaterThan(0);
  });

  it('bandas desligadas não entram no IR nem nos desvios', () => {
    const curve = withBand(defaultCurve('nano-cortex'), 'mid', { gainDb: -12, enabled: false });
    const r = computeIr({ id: 1, curve });
    expect(r.ir[0]).toBe(1);
    expect(r.bandDeviations.some((d) => d.bandId === 'mid')).toBe(false);
  });
});

describe('cliente do worker (debounce + último vence)', () => {
  afterEach(() => vi.useRealTimers());

  it('rajada de pedidos vira UM cálculo com o último estado', async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const transport: IrTransport = async (req) => {
      calls.push(req.curve.outputGainDb);
      return computeIr(req);
    };
    const results: IrComputation[] = [];
    const client = new IrClient({ transport, onResult: (r) => results.push(r), debounceMs: 30 });
    for (let g = 1; g <= 20; g++) client.request({ curve: { ...flatCurve('nano-cortex'), outputGainDb: g } });
    await vi.advanceTimersByTimeAsync(29);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([20]);
    expect(results).toHaveLength(1);
    expect(results[0]!.peak).toBeCloseTo(10, 4); // +20 dB
  });

  it('arrasto contínuo atualiza a cada ~30 ms (não congela até soltar)', async () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const transport: IrTransport = async (req) => computeIr(req);
    const client = new IrClient({
      transport,
      onResult: (r) => seen.push(Math.round(20 * Math.log10(r.peak))),
      debounceMs: 30,
    });
    // 1 atualização a cada 16 ms durante ~320 ms (como um arrasto a 60 fps)
    for (let g = 1; g <= 20; g++) {
      client.request({ curve: { ...flatCurve('nano-cortex'), outputGainDb: g } });
      await vi.advanceTimersByTimeAsync(16);
    }
    await vi.advanceTimersByTimeAsync(30);
    expect(seen.length).toBeGreaterThanOrEqual(8);
    expect(seen.length).toBeLessThanOrEqual(12);
    expect(seen.at(-1)).toBe(20); // o último estado sempre é calculado
  });

  it('resposta atrasada de um pedido antigo é descartada', async () => {
    const resolvers: ((r: IrComputation) => void)[] = [];
    const transport: IrTransport = (req) =>
      new Promise((resolve) => resolvers.push(() => resolve(computeIr(req))));
    const applied: number[] = [];
    const client = new IrClient({ transport, onResult: (r) => applied.push(r.id), debounceMs: 0 });

    client.request({ curve: flatCurve('nano-cortex') });
    const p1 = client.flush();
    client.request({ curve: flatCurve('helix') });
    const p2 = client.flush();

    resolvers[1]!(undefined as never); // o NOVO termina primeiro
    await p2;
    resolvers[0]!(undefined as never); // o antigo chega depois
    await p1;
    expect(applied).toEqual([2]);
  });

  it('flush dispara na hora, sem esperar o debounce', async () => {
    const transport: IrTransport = async (req) => computeIr(req);
    const applied: number[] = [];
    const client = new IrClient({ transport, onResult: (r) => applied.push(r.length), debounceMs: 10_000 });
    client.request({ curve: flatCurve('helix') });
    await client.flush();
    expect(applied).toEqual([2048]);
  });
});
