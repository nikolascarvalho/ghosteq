import { useSyncExternalStore } from 'react';
import { ptBR, type MessageKey, type Messages } from './pt-BR';
import { en } from './en';

// Solução própria e mínima: um dicionário por idioma + um "store" pequeno.
// Analogia: é um lookup numa tabela de dimensão (chave -> texto) por idioma.

export type Lang = 'pt-BR' | 'en';
export type { MessageKey };
const dictionaries: Record<Lang, Messages> = { 'pt-BR': ptBR, en };
const STORAGE_KEY = 'ghosteq.lang';

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'pt-BR' || saved === 'en') return saved;
  } catch {
    /* storage indisponível: segue para o idioma do navegador */
  }
  return navigator.language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

let current: Lang = typeof navigator === 'undefined' ? 'pt-BR' : detect();
const listeners = new Set<() => void>();

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignora */
  }
  document.documentElement.lang = lang;
  listeners.forEach((l) => l());
}

export function getLang(): Lang {
  return current;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export type Vars = Record<string, string | number>;

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  let text = dictionaries[lang][key];
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/** Hook: devolve t(chave, variáveis) no idioma atual e re-renderiza ao trocar idioma. */
export function useT() {
  const lang = useSyncExternalStore(subscribe, getLang, getLang);
  return { lang, t: (key: MessageKey, vars?: Vars) => translate(lang, key, vars) };
}
