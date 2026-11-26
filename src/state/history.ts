// Desfazer/refazer como funções puras sobre "snapshots" imutáveis.
// Analogia: é time travel de uma tabela Delta — cada mudança grava a versão
// anterior em `past`; desfazer move a versão atual para `future`.

export interface History<T> {
  past: T[];
  future: T[];
}

export const HISTORY_LIMIT = 100;

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] };
}

/** Registra que `previous` deixou de ser o estado atual. Toda edição nova limpa o "refazer". */
export function record<T>(h: History<T>, previous: T, limit = HISTORY_LIMIT): History<T> {
  const past = [...h.past, previous];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, future: [] };
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (h.past.length === 0) return null;
  const value = h.past[h.past.length - 1]!;
  return { history: { past: h.past.slice(0, -1), future: [current, ...h.future] }, value };
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (h.future.length === 0) return null;
  const [value, ...rest] = h.future;
  return { history: { past: [...h.past, current], future: rest }, value: value! };
}
