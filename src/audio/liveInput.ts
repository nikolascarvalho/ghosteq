// Camada de áudio: abre a entrada ao vivo com as configurações "cruas"
// (sem cancelamento de eco, supressão de ruído ou ganho automático) e monta
// o grafo de diagnóstico: fonte -> splitter -> um analisador por canal.
// A entrada NUNCA é ligada na saída aqui (sem risco de microfonia).
import probeUrl from './worklets/channel-probe.worklet.js?url';

export const MAX_CHANNELS = 8;
export const TARGET_SAMPLE_RATE = 48000;

/** Configurações de getUserMedia reutilizadas pelo modo ao vivo depois. */
export function rawAudioConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    channelCount: { ideal: MAX_CHANNELS },
    sampleRate: { ideal: TARGET_SAMPLE_RATE },
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    // `latency` existe no Chrome; navegadores que não conhecem simplesmente ignoram.
    latency: { ideal: 0 },
  } as MediaTrackConstraints;
}

export function createAudioContext(): AudioContext {
  return new AudioContext({ sampleRate: TARGET_SAMPLE_RATE, latencyHint: 'interactive' });
}

/** Pede permissão uma vez (necessário para enumerateDevices devolver nomes). */
export async function requestPermission(): Promise<void> {
  const s = await navigator.mediaDevices.getUserMedia({ audio: true });
  s.getTracks().forEach((t) => t.stop());
}

export async function listInputDevices(): Promise<MediaDeviceInfo[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'audioinput');
}

export interface ProbeReport {
  channels: number;
  peaks: number[];
}

export interface LiveInput {
  ctx: AudioContext;
  stream: MediaStream;
  track: MediaStreamTrack;
  source: MediaStreamAudioSourceNode;
  analysers: AnalyserNode[];
  settings: MediaTrackSettings;
  capabilities: MediaTrackCapabilities | null;
  onProbe: (cb: (r: ProbeReport) => void) => void;
  close: () => Promise<void>;
}

export async function openLiveInput(deviceId: string): Promise<LiveInput> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: rawAudioConstraints(deviceId) });
  const track = stream.getAudioTracks()[0];
  if (!track) throw new Error('No audio track');

  const ctx = createAudioContext();
  await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);

  // Splitter "discreto": canal N da fonte -> saída N, sem mixagem.
  const splitter = ctx.createChannelSplitter(MAX_CHANNELS);
  source.connect(splitter);
  const analysers: AnalyserNode[] = [];
  for (let c = 0; c < MAX_CHANNELS; c++) {
    const a = ctx.createAnalyser();
    a.fftSize = 2048;
    a.smoothingTimeConstant = 0;
    splitter.connect(a, c);
    analysers.push(a);
  }

  // Sonda que conta os canais reais. Ligada num ganho 0 -> destino só para
  // garantir que o navegador a processe; nada audível sai.
  let probeCb: ((r: ProbeReport) => void) | null = null;
  let probe: AudioWorkletNode | null = null;
  const sink = ctx.createGain();
  sink.gain.value = 0;
  sink.connect(ctx.destination);
  try {
    await ctx.audioWorklet.addModule(probeUrl);
    probe = new AudioWorkletNode(ctx, 'channel-probe', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCountMode: 'max',
      channelInterpretation: 'discrete',
    });
    probe.port.onmessage = (e: MessageEvent<ProbeReport>) => probeCb?.(e.data);
    source.connect(probe);
    probe.connect(sink);
  } catch (err) {
    console.warn('AudioWorklet indisponível; contagem real de canais desativada', err);
  }

  let closed = false;
  let capabilities: MediaTrackCapabilities | null;
  try {
    capabilities = track.getCapabilities?.() ?? null;
  } catch {
    capabilities = null;
  }

  return {
    ctx,
    stream,
    track,
    source,
    analysers,
    settings: track.getSettings(),
    capabilities,
    onProbe: (cb) => {
      probeCb = cb;
    },
    close: async () => {
      // Idempotente: pode ser chamado pela UI e pelo cleanup do React.
      if (closed) return;
      closed = true;
      probe?.port.close();
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
    },
  };
}

/** Pico e RMS (em dBFS) de um analisador. */
export function readLevel(
  a: AnalyserNode,
  buf: Float32Array<ArrayBuffer>,
): { peakDb: number; rmsDb: number } {
  a.getFloatTimeDomainData(buf);
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i]!;
    const abs = Math.abs(v);
    if (abs > peak) peak = abs;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / buf.length);
  const toDb = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  return { peakDb: toDb(peak), rmsDb: toDb(rms) };
}
