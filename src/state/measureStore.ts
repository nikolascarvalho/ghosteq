// Roteiro de medição de latência: uma tabela que o usuário preenche
// comparando configurações (Chrome × Edge, baixa latência ligada × desligada,
// saída pela placa do PC × pelo Nano). Fica salva no localStorage (só neste
// navegador) e pode ser copiada como Markdown.
import { create } from 'zustand';

export type MeasureBrowser = 'chrome' | 'edge';
export type MeasureOutput = 'pc' | 'nano';

export interface MeasureRow {
  browser: MeasureBrowser;
  lowLatency: boolean;
  output: MeasureOutput;
}

export interface MeasureEntry {
  totalMs: string;
  crackle: boolean;
  notes: string;
}

export const MEASURE_ROWS: MeasureRow[] = (['chrome', 'edge'] as const).flatMap((browser) =>
  [true, false].flatMap((lowLatency) =>
    (['pc', 'nano'] as const).map((output) => ({ browser, lowLatency, output })),
  ),
);

export const rowKey = (r: MeasureRow) => `${r.browser}|${r.lowLatency ? 'll' : 'std'}|${r.output}`;

const EMPTY: MeasureEntry = { totalMs: '', crackle: false, notes: '' };

export interface MarkdownLabels {
  browser: string;
  lowLatency: string;
  output: string;
  total: string;
  crackle: string;
  notes: string;
  on: string;
  off: string;
  yes: string;
  no: string;
  pc: string;
  nano: string;
}

const BROWSER_LABEL: Record<MeasureBrowser, string> = { chrome: 'Chrome', edge: 'Edge' };

/** Tabela em Markdown (para colar na conversa ou no README). */
export function toMarkdown(entries: Record<string, MeasureEntry>, l: MarkdownLabels): string {
  const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const head = `| ${l.browser} | ${l.lowLatency} | ${l.output} | ${l.total} | ${l.crackle} | ${l.notes} |`;
  const sep = '|---|---|---|---|---|---|';
  const rows = MEASURE_ROWS.map((r) => {
    const e = entries[rowKey(r)] ?? EMPTY;
    return `| ${BROWSER_LABEL[r.browser]} | ${r.lowLatency ? l.on : l.off} | ${r.output === 'pc' ? l.pc : l.nano} | ${cell(e.totalMs)} | ${e.totalMs || e.crackle ? (e.crackle ? l.yes : l.no) : ''} | ${cell(e.notes)} |`;
  });
  return [head, sep, ...rows].join('\n');
}

const STORAGE_KEY = 'ghosteq.latencyLog';

function load(): Record<string, MeasureEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const obj = raw ? (JSON.parse(raw) as unknown) : null;
    if (!obj || typeof obj !== 'object') return {};
    const out: Record<string, MeasureEntry> = {};
    for (const r of MEASURE_ROWS) {
      const e = (obj as Record<string, Partial<MeasureEntry>>)[rowKey(r)];
      if (e)
        out[rowKey(r)] = {
          totalMs: typeof e.totalMs === 'string' ? e.totalMs : '',
          crackle: e.crackle === true,
          notes: typeof e.notes === 'string' ? e.notes : '',
        };
    }
    return out;
  } catch {
    return {};
  }
}

function save(entries: Record<string, MeasureEntry>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* storage indisponível: a tabela vale só nesta sessão */
  }
}

interface MeasureState {
  entries: Record<string, MeasureEntry>;
  update: (key: string, patch: Partial<MeasureEntry>) => void;
  clear: () => void;
}

export const useMeasureStore = create<MeasureState>()((set, get) => ({
  entries: typeof localStorage === 'undefined' ? {} : load(),
  update: (key, patch) => {
    const entries = { ...get().entries, [key]: { ...EMPTY, ...get().entries[key], ...patch } };
    save(entries);
    set({ entries });
  },
  clear: () => {
    save({});
    set({ entries: {} });
  },
}));
