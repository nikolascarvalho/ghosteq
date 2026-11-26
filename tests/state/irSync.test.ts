import { afterEach, describe, expect, it } from 'vitest';
import { defaultCurve } from '../../src/model/curve';
import { useCurveStore } from '../../src/state/curveStore';
import { flushIr, startIrSync, useIrStore } from '../../src/state/irStore';
import { computeIr } from '../../src/workers/irEngine';

let stop: (() => void) | null = null;
afterEach(() => stop?.());

describe('sincronização curva → IR', () => {
  it('mudar a curva recalcula o IR; trocar formato preferido também', async () => {
    useCurveStore.setState({ curve: defaultCurve('nano-cortex'), history: { past: [], future: [] } });
    stop = startIrSync(async (req) => computeIr(req), 0);
    await flushIr();
    expect(useIrStore.getState().result?.peak).toBe(1);

    useCurveStore.getState().setOutputGain(6);
    await flushIr();
    expect(useIrStore.getState().result?.peak).toBeCloseTo(1.995, 3);
    expect(useIrStore.getState().result?.exportFormat.format).toBe('float32');

    useCurveStore.getState().setOutputGain(0);
    useIrStore.getState().setPreferredFormat('float32');
    await flushIr();
    expect(useIrStore.getState().result?.exportFormat).toEqual({ format: 'float32', forcedFloat: false });
  });
});
