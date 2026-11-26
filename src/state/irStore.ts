// Resultado derivado: o IR calculado a partir da curva atual.
// É "cache" — nunca editado diretamente pela UI, só pelo sincronizador abaixo.
import { create } from 'zustand';
import type { WavSampleFormat } from '../io/wavEncode';
import { IrClient, createWorkerTransport, type IrTransport } from '../workers/dspClient';
import type { IrComputation } from '../workers/irEngine';
import { selectCabInput, useCabStore } from './cabStore';
import { useCurveStore } from './curveStore';

interface IrState {
  result: IrComputation | null;
  error: string | null;
  preferredFormat: WavSampleFormat;
  setPreferredFormat: (f: WavSampleFormat) => void;
}

export const useIrStore = create<IrState>()((set) => ({
  result: null,
  error: null,
  preferredFormat: 'pcm24',
  setPreferredFormat: (preferredFormat) => set({ preferredFormat }),
}));

let client: IrClient | null = null;

/**
 * Liga curva → worker → resultado. Chamado uma vez na inicialização do app.
 * A cada mudança da curva (ou do formato preferido) pede um novo cálculo
 * (com debounce). Devolve uma função para desligar (usada nos testes).
 */
export function startIrSync(
  transport: IrTransport = createWorkerTransport(),
  debounceMs?: number,
): () => void {
  client?.dispose();
  const c = new IrClient({
    transport,
    debounceMs,
    onResult: (result) => useIrStore.setState({ result, error: null }),
    onError: (error) => useIrStore.setState({ error }),
  });
  client = c;

  const request = () =>
    c.request({
      curve: useCurveStore.getState().curve,
      preferredFormat: useIrStore.getState().preferredFormat,
      cab: selectCabInput(useCabStore.getState()),
    });

  request();
  const unsubCurve = useCurveStore.subscribe((s, prev) => {
    if (s.curve !== prev.curve) request();
  });
  const unsubFormat = useIrStore.subscribe((s, prev) => {
    if (s.preferredFormat !== prev.preferredFormat) request();
  });
  const unsubCab = useCabStore.subscribe((s, prev) => {
    if (s.cab !== prev.cab || s.enabled !== prev.enabled) request();
  });

  return () => {
    unsubCurve();
    unsubFormat();
    unsubCab();
    c.dispose();
    if (client === c) client = null;
  };
}

/** Garante que o resultado reflete a curva atual (ex.: logo antes de exportar). */
export function flushIr(): Promise<void> {
  return client?.flush() ?? Promise.resolve();
}
