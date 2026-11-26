// Persistência local de presets no IndexedDB (o "banco de dados" embutido do
// navegador; fica no aparelho, nunca vai para servidor). Usamos idb-keyval,
// uma camada mínima que transforma o IndexedDB num key-value store assíncrono.
import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval';
import type { CurveConfig } from '../model/curve';
import { parseCurve, type ParseResult } from './presetsJson';

export interface StoredPreset {
  id: string;
  name: string;
  savedAt: string;
  curve: CurveConfig;
}

let store: UseStore | null = null;
/** Store criado sob demanda (evita tocar no IndexedDB só por importar o módulo). */
function presetsStore(): UseStore {
  store ??= createStore('ghosteq', 'presets');
  return store;
}

export function newPresetId(): string {
  return crypto.randomUUID();
}

/** Cria ou sobrescreve (mesmo id) um preset. */
export async function savePreset(preset: StoredPreset): Promise<void> {
  await set(preset.id, preset, presetsStore());
}

/**
 * Carrega um preset, passando a curva pela migração/validação: um preset salvo
 * numa versão antiga do app é atualizado na leitura.
 */
export async function loadPreset(id: string): Promise<ParseResult<StoredPreset> | null> {
  const raw = (await get(id, presetsStore())) as Partial<StoredPreset> | undefined;
  if (!raw) return null;
  const curve = parseCurve(raw.curve);
  if (!curve.ok) return curve;
  return {
    ok: true,
    value: { id, name: raw.name ?? 'Sem nome', savedAt: raw.savedAt ?? '', curve: curve.value },
    warnings: curve.warnings,
  };
}

/** Lista resumida (sem validar cada curva), mais recentes primeiro. */
export async function listPresets(): Promise<Pick<StoredPreset, 'id' | 'name' | 'savedAt'>[]> {
  const all = await entries<string, StoredPreset>(presetsStore());
  return all
    .map(([id, p]) => ({ id, name: p.name, savedAt: p.savedAt }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function deletePreset(id: string): Promise<void> {
  await del(id, presetsStore());
}
