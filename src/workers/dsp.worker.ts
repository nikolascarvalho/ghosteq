// Web Worker: uma thread separada que roda o DSP sem travar a tela.
// Analogia: é um executor de jobs em background — a UI só envia a "requisição"
// (a curva em JSON) e recebe o resultado pronto.
import { computeIr, transferables, type IrRequest } from './irEngine';

export type WorkerResponse =
  { ok: true; result: ReturnType<typeof computeIr> } | { ok: false; id: number; error: string };

self.onmessage = (e: MessageEvent<IrRequest>) => {
  try {
    const result = computeIr(e.data);
    (self as unknown as Worker).postMessage(
      { ok: true, result } satisfies WorkerResponse,
      transferables(result),
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({
      ok: false,
      id: e.data.id,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
};
