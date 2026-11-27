// Estado do modo de escuta/ao vivo + ponte para o motor de áudio.
// O motor (AudioEngine) é um objeto do navegador, não um dado: fica numa
// variável do módulo; o store guarda só o que a tela precisa mostrar.
import { create } from 'zustand';
import { AudioEngine, probeOutputRate, type AB } from '../audio/engine';
import { loadExampleLoop } from '../audio/exampleLoops';
import { measureGraphDelay, type GraphDelay } from '../audio/graph';
import { channelOptions, defaultChannelSelection, isNanoLabel, START_VOLUME_DB } from '../audio/helpers';
import { defaultLowLatency, detectPlatform, type PlatformInfo, type UaBrand } from '../audio/latency';
import type { LoopStyle } from '../audio/placeholderLoops';
import { DEVICE_PRESETS } from '../config/devices';
import { useIrStore } from './irStore';

export type SourceKind = 'live' | 'file' | 'example';
export type AudioErrorCode = 'permission' | 'busy' | 'device' | 'decode' | 'noExample' | 'sink' | 'unknown';

interface AudioState {
  on: boolean;
  source: SourceKind | null;
  playing: string | null; // nome do que está tocando
  placeholder: boolean;
  ab: AB;
  match: boolean;
  volumeDb: number;
  muted: boolean;
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
  inputId: string;
  channelCount: number;
  channelSel: string;
  sinkId: string;
  trackLatency: number | null;
  trackSampleRate: number | null;
  /** Taxa nativa do dispositivo de saída escolhido (null = desconhecida). */
  outputRate: number | null;
  /** Atraso do grafo medido com impulso ao ligar (null = ainda medindo/falhou). */
  graphDelay: GraphDelay | null;
  /** Modo baixa latência (latencyHint 0). Lembrado no localStorage. */
  lowLatency: boolean;
  platform: PlatformInfo;
  error: { code: AudioErrorCode; detail: string } | null;

  powerOn: () => Promise<void>;
  powerOff: () => Promise<void>;
  /** Botão de pânico: mudo instantâneo + para a fonte. */
  panic: () => void;
  setAB: (ab: AB) => void;
  toggleAB: () => void;
  setMatch: (on: boolean) => void;
  setVolumeDb: (db: number) => void;
  setMuted: (m: boolean) => void;
  refreshDevices: () => Promise<void>;
  setInputId: (id: string) => void;
  setChannelSel: (id: string) => Promise<void>;
  startLive: () => Promise<void>;
  playFile: (file: File) => Promise<void>;
  playExample: (style: LoopStyle) => Promise<void>;
  stop: () => void;
  setSink: (id: string) => Promise<void>;
  /** Liga/desliga a baixa latência. Exige recriar o AudioContext: reinicia o áudio. */
  setLowLatency: (on: boolean) => Promise<void>;
}

let engine: AudioEngine | null = null;
let starting: Promise<AudioEngine> | null = null;
let unsubIr: (() => void) | null = null;

const LOW_LATENCY_KEY = 'ghosteq.lowLatency';

function readPlatform(): PlatformInfo {
  if (typeof navigator === 'undefined') return detectPlatform('');
  const uad = (navigator as Navigator & { userAgentData?: { brands?: UaBrand[]; platform?: string } })
    .userAgentData;
  return detectPlatform(navigator.userAgent, uad?.brands, uad?.platform);
}

function readLowLatency(p: PlatformInfo): boolean {
  try {
    const v = localStorage.getItem(LOW_LATENCY_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* sem storage: usa o padrão */
  }
  return defaultLowLatency(p.os);
}

const platform = readPlatform();

/** Acesso ao motor para a tela desenhar espectro/medidores (null se desligado). */
export const getEngine = () => engine;

export const supportsSinkId = () =>
  typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;

function errorOf(
  err: unknown,
  fallback: AudioErrorCode = 'unknown',
): { code: AudioErrorCode; detail: string } {
  const name = err instanceof DOMException ? err.name : '';
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  if (name === 'NotAllowedError' || name === 'SecurityError') return { code: 'permission', detail };
  if (name === 'NotReadableError' || name === 'AbortError') return { code: 'busy', detail };
  if (name === 'OverconstrainedError' || name === 'NotFoundError') return { code: 'device', detail };
  if (name === 'EncodingError') return { code: 'decode', detail };
  return { code: fallback, detail };
}

export const useAudioStore = create<AudioState>()((set, get) => ({
  on: false,
  source: null,
  playing: null,
  placeholder: false,
  ab: 'B',
  match: false,
  volumeDb: START_VOLUME_DB,
  muted: false,
  inputs: [],
  outputs: [],
  inputId: '',
  channelCount: 2,
  channelSel: '1+2',
  sinkId: '',
  trackLatency: null,
  trackSampleRate: null,
  outputRate: null,
  graphDelay: null,
  lowLatency: readLowLatency(platform),
  platform,
  error: null,

  powerOn: async () => {
    if (engine) return;
    if (starting) {
      await starting.catch(() => undefined);
      return;
    }
    starting = AudioEngine.create({ lowLatency: get().lowLatency });
    let e: AudioEngine;
    try {
      e = await starting;
    } catch (err) {
      set({ error: errorOf(err) });
      return;
    } finally {
      starting = null;
    }
    engine = e;
    await e.resume();
    // Saída escolhida antes (setSinkId) vale também para o contexto novo.
    const sinkId = get().sinkId;
    if (sinkId) await e.setSinkId(sinkId).catch(() => set({ sinkId: '' }));
    // Toda vez que liga: volume em −12 dB, sem mudo, ouvindo o IR (B).
    set({ on: true, volumeDb: START_VOLUME_DB, muted: false, ab: 'B', error: null });
    e.setVolumeDb(START_VOLUME_DB);
    e.setAB('B');
    e.setLoudnessMatch(get().match);
    // O IR que toca é SEMPRE o último calculado (o mesmo da exportação).
    const apply = () => {
      const r = useIrStore.getState().result;
      if (r && engine) engine.setIr(r.ir, r.sampleRate);
    };
    apply();
    unsubIr = useIrStore.subscribe((s, prev) => {
      if (s.result !== prev.result) apply();
    });
    void get().refreshDevices();
    void probeOutputRate(get().sinkId || undefined).then((outputRate) => set({ outputRate }));
    // Mede (com impulso, fora do tempo real) quanto o grafo atrasa o som.
    const irLen = useIrStore.getState().result?.ir.length ?? 1024;
    set({ graphDelay: null });
    void measureGraphDelay(irLen)
      .then((graphDelay) => set({ graphDelay }))
      .catch((err) => console.warn('Medição do atraso do grafo falhou', err));
  },

  powerOff: async () => {
    unsubIr?.();
    unsubIr = null;
    const e = engine;
    engine = null;
    set({
      on: false,
      source: null,
      playing: null,
      placeholder: false,
      trackLatency: null,
      trackSampleRate: null,
    });
    await e?.close();
  },

  panic: () => {
    engine?.setMuted(true);
    engine?.stopSource();
    set({ muted: true, source: null, playing: null });
  },

  setAB: (ab) => {
    engine?.setAB(ab);
    set({ ab });
  },
  toggleAB: () => get().setAB(get().ab === 'A' ? 'B' : 'A'),

  setMatch: (on) => {
    engine?.setLoudnessMatch(on);
    set({ match: on });
  },

  setVolumeDb: (db) => {
    engine?.setVolumeDb(db);
    set({ volumeDb: db });
  },

  setMuted: (m) => {
    engine?.setMuted(m);
    set({ muted: m });
  },

  refreshDevices: async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all.filter((d) => d.kind === 'audioinput');
      const outputs = all.filter((d) => d.kind === 'audiooutput');
      const cur = get().inputId;
      // Prefere o Nano se aparecer na lista.
      const nano = inputs.find((d) => isNanoLabel(d.label));
      const inputId = inputs.some((d) => d.deviceId === cur) ? cur : ((nano ?? inputs[0])?.deviceId ?? '');
      set({ inputs, outputs, inputId });
    } catch {
      /* sem permissão ainda: a lista fica vazia até startLive */
    }
  },

  setInputId: (id) => set({ inputId: id }),

  setChannelSel: async (id) => {
    const opt = channelOptions(get().channelCount).find((o) => o.id === id);
    if (!opt) return;
    engine?.setLiveChannels(opt.channels);
    set({ channelSel: id });
  },

  startLive: async () => {
    if (!engine) await get().powerOn();
    const e = engine!;
    try {
      const { inputId, inputs } = get();
      const label = inputs.find((d) => d.deviceId === inputId)?.label ?? '';
      const nanoUsb = isNanoLabel(label)
        ? DEVICE_PRESETS.find((d) => d.id === 'nano-cortex')?.usb
        : undefined;
      // Abre o dispositivo, vê quantos canais chegaram e escolhe o padrão
      // (Nano: 3+4 = sinal processado; outros: 1+2).
      const info = await e.startLive(inputId, [0]);
      const sel = defaultChannelSelection(info.channelCount, nanoUsb);
      e.setLiveChannels(channelOptions(info.channelCount).find((o) => o.id === sel)!.channels);
      e.setMuted(false);
      set({
        source: 'live',
        playing: info.label || label,
        placeholder: false,
        channelCount: info.channelCount,
        channelSel: sel,
        trackLatency: info.trackLatency,
        trackSampleRate: info.trackSampleRate,
        muted: false,
        error: null,
      });
      void get().refreshDevices(); // agora com permissão, os nomes aparecem
    } catch (err) {
      set({ error: errorOf(err, 'device') });
    }
  },

  playFile: async (file) => {
    if (!engine) await get().powerOn();
    try {
      const buf = await engine!.decodeFile(await file.arrayBuffer());
      engine!.playBuffer(buf);
      engine!.setMuted(false);
      set({ source: 'file', playing: file.name, placeholder: false, muted: false, error: null });
    } catch (err) {
      set({ error: errorOf(err, 'decode') });
    }
  },

  playExample: async (style) => {
    if (!engine) await get().powerOn();
    const loop = await loadExampleLoop(engine!, style);
    if (!loop) {
      set({ error: { code: 'noExample', detail: style } });
      return;
    }
    engine!.playBuffer(loop.buffer);
    engine!.setMuted(false);
    set({ source: 'example', playing: style, placeholder: loop.placeholder, muted: false, error: null });
  },

  stop: () => {
    engine?.stopSource();
    set({ source: null, playing: null, trackLatency: null, trackSampleRate: null });
  },

  setSink: async (id) => {
    try {
      await engine?.setSinkId(id);
      set({ sinkId: id });
      void probeOutputRate(id || undefined).then((outputRate) => set({ outputRate }));
    } catch (err) {
      set({ error: errorOf(err, 'sink') });
    }
  },

  setLowLatency: async (on) => {
    try {
      localStorage.setItem(LOW_LATENCY_KEY, on ? '1' : '0');
    } catch {
      /* ignora */
    }
    set({ lowLatency: on });
    if (!engine) return;
    // latencyHint só vale na criação do AudioContext: desliga e liga de novo.
    // (O volume volta a −12 dB, como em todo "ligar".)
    const wasLive = get().source === 'live';
    await get().powerOff();
    await get().powerOn();
    if (wasLive) await get().startLive();
  },
}));
