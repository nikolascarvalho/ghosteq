// Cliente do worker, do lado da interface.
// - Janela de ~30 ms: no máximo um cálculo por janela, sempre com o estado mais recente.
// - "Último vence": respostas atrasadas de pedidos antigos são descartadas.
// Analogia: é um consumer que compacta eventos por chave e só processa o mais recente.
import type { WorkerResponse } from './dsp.worker';
import { computeIr, type IrComputation, type IrRequest } from './irEngine';

export const DEBOUNCE_MS = 30;

/** Executa um pedido e devolve o resultado (worker real, ou cálculo direto nos testes). */
export type IrTransport = (req: IrRequest) => Promise<IrComputation>;

export interface IrClientOptions {
  transport: IrTransport;
  onResult: (r: IrComputation) => void;
  onError?: (message: string) => void;
  debounceMs?: number;
}

export class IrClient {
  private seq = 0;
  private latestApplied = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Omit<IrRequest, 'id'> | null = null;
  private readonly opts: IrClientOptions;

  constructor(opts: IrClientOptions) {
    this.opts = opts;
  }

  /**
   * Agenda o cálculo. Chamadas dentro da mesma janela de ~30 ms só substituem o
   * pedido pendente (sem reiniciar o relógio). Assim, durante um arrasto
   * contínuo, o gráfico atualiza a cada ~30 ms com o estado mais recente,
   * em vez de congelar até o usuário soltar (o que um debounce puro faria).
   */
  request(req: Omit<IrRequest, 'id'>): void {
    this.pending = req;
    this.timer ??= setTimeout(() => void this.flush(), this.opts.debounceMs ?? DEBOUNCE_MS);
  }

  /** Dispara já o pedido pendente (ex.: antes de exportar). */
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const req = this.pending;
    if (!req) return Promise.resolve();
    this.pending = null;
    const id = ++this.seq;
    return this.opts.transport({ ...req, id }).then(
      (result) => {
        if (id < this.latestApplied) return; // chegou atrasado: já mostramos algo mais novo
        this.latestApplied = id;
        this.opts.onResult(result);
      },
      (err: unknown) => this.opts.onError?.(err instanceof Error ? err.message : String(err)),
    );
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.pending = null;
  }
}

/** Transporte que usa o Web Worker real; cai para cálculo direto se Worker não existir. */
export function createWorkerTransport(): IrTransport {
  if (typeof Worker === 'undefined') return (req) => Promise.resolve(computeIr(req));

  const worker = new Worker(new URL('./dsp.worker.ts', import.meta.url), { type: 'module' });
  const waiting = new Map<number, { resolve: (r: IrComputation) => void; reject: (e: Error) => void }>();
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    const id = msg.ok ? msg.result.id : msg.id;
    const w = waiting.get(id);
    if (!w) return;
    waiting.delete(id);
    if (msg.ok) w.resolve(msg.result);
    else w.reject(new Error(msg.error));
  };
  worker.onerror = (e) => {
    for (const w of waiting.values()) w.reject(new Error(e.message || 'Erro no worker de DSP'));
    waiting.clear();
  };
  return (req) =>
    new Promise((resolve, reject) => {
      waiting.set(req.id, { resolve, reject });
      worker.postMessage(req);
    });
}
