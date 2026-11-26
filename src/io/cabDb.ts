// Guarda o IR de caixa importado no IndexedDB (no próprio aparelho), para que
// recarregar a página não exija importar de novo. Só um slot ("caixa atual").
import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type { DownmixMode } from './wavDecode';

export interface StoredCab {
  name: string;
  sampleRate: number;
  /** Canais originais (antes do downmix), já cortados no tamanho máximo. */
  channels: Float32Array[];
  downmix: DownmixMode;
  trimmed: boolean;
}

const KEY = 'current';
let store: UseStore | null = null;
const cabStore = () => (store ??= createStore('ghosteq-cab', 'cab'));

export async function saveCab(cab: StoredCab): Promise<void> {
  await set(KEY, cab, cabStore());
}

export async function loadCab(): Promise<StoredCab | null> {
  return ((await get(KEY, cabStore())) as StoredCab | undefined) ?? null;
}

export async function clearCab(): Promise<void> {
  await del(KEY, cabStore());
}
