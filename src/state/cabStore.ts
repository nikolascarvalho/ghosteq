// IR de caixa (cab) carregado pelo usuário. Fica FORA da curva (e do desfazer):
// é um arquivo de áudio, não um ajuste. A curva continua sendo só o EQ.
import { create } from 'zustand';
import { clearCab, loadCab, saveCab, type StoredCab } from '../io/cabDb';
import { decodeWav, downmix, WavDecodeError, type DownmixMode } from '../io/wavDecode';
import type { CabInput } from '../workers/irEngine';

/** Caixas maiores que isso são cortadas (nenhum aparelho usa mais que ~1 s de IR). */
export const MAX_CAB_SECONDS = 2;

export type CabErrorCode = WavDecodeError['code'] | 'empty' | 'unknown';

export interface LoadedCab extends StoredCab {
  /** Mono, pronto para o motor de DSP. */
  samples: Float32Array;
}

interface CabState {
  cab: LoadedCab | null;
  enabled: boolean;
  error: { code: CabErrorCode; detail: string } | null;
  loadFromBuffer: (buffer: ArrayBuffer, name: string) => Promise<void>;
  setDownmix: (mode: DownmixMode) => void;
  setEnabled: (enabled: boolean) => void;
  remove: () => Promise<void>;
  /** Recarrega a caixa salva no IndexedDB (chamado na inicialização). */
  hydrate: () => Promise<void>;
}

function withMono(stored: StoredCab): LoadedCab {
  const mono = downmix(
    stored.channels.map((c) => Float64Array.from(c)),
    stored.downmix,
  );
  return { ...stored, samples: Float32Array.from(mono) };
}

export const useCabStore = create<CabState>()((set, get) => ({
  cab: null,
  enabled: true,
  error: null,

  loadFromBuffer: async (buffer, name) => {
    try {
      const wav = decodeWav(buffer);
      const maxFrames = Math.round(wav.sampleRate * MAX_CAB_SECONDS);
      const frames = wav.channels[0]?.length ?? 0;
      if (frames === 0) {
        set({ error: { code: 'empty', detail: name } });
        return;
      }
      const stored: StoredCab = {
        name,
        sampleRate: wav.sampleRate,
        channels: wav.channels.map((c) => Float32Array.from(c.subarray(0, maxFrames))),
        // Estéreo: começa usando só o L (o usuário pode trocar para a média L+R).
        downmix: 'left',
        trimmed: frames > maxFrames,
      };
      set({ cab: withMono(stored), enabled: true, error: null });
      await saveCab(stored);
    } catch (err) {
      const code: CabErrorCode = err instanceof WavDecodeError ? err.code : 'unknown';
      set({ error: { code, detail: err instanceof Error ? err.message : String(err) } });
    }
  },

  setDownmix: (mode) => {
    const { cab } = get();
    if (!cab || cab.downmix === mode) return;
    const stored: StoredCab = { ...cab, downmix: mode };
    set({ cab: withMono(stored) });
    void saveCab(stored);
  },

  setEnabled: (enabled) => set({ enabled }),

  remove: async () => {
    set({ cab: null, error: null });
    await clearCab();
  },

  hydrate: async () => {
    try {
      const stored = await loadCab();
      if (stored && !get().cab) set({ cab: withMono(stored) });
    } catch {
      /* IndexedDB indisponível (aba privada etc.): segue sem caixa */
    }
  },
}));

/** Entrada para o motor de DSP (ou undefined se não há caixa ativa). */
export function selectCabInput(s: Pick<CabState, 'cab' | 'enabled'>): CabInput | undefined {
  return s.cab && s.enabled ? { samples: s.cab.samples, sampleRate: s.cab.sampleRate } : undefined;
}
