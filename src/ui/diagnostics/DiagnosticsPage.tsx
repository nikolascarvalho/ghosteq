import { useCallback, useEffect, useRef, useState } from 'react';
import { useT, type MessageKey } from '../../i18n';
import {
  listInputDevices,
  openLiveInput,
  readLevel,
  requestPermission,
  MAX_CHANNELS,
  type LiveInput,
} from '../../audio/liveInput';
import { DEVICE_PRESETS } from '../../config/devices';
import { useAudioStore } from '../../state/audioStore';
import { LevelMeter } from '../common/LevelMeter';
import { MeasurementTable } from './MeasurementTable';

interface Latencies {
  base: number | null;
  output: number | null;
  input: number | null;
}

function errorKey(err: unknown): MessageKey | null {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'diag.errNotAllowed';
  if (name === 'NotReadableError' || name === 'AbortError') return 'diag.errNotReadable';
  if (name === 'OverconstrainedError') return 'diag.errOverconstrained';
  return null;
}

const ms = (s: number | null) => (s == null ? null : Math.round(s * 10000) / 10);

export function DiagnosticsPage() {
  const { t } = useT();
  const [permission, setPermission] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  // null = automático pelo nome do dispositivo; string = escolha manual do usuário.
  const [presetOverride, setPresetOverride] = useState<string | null>(null);
  const [input, setInput] = useState<LiveInput | null>(null);
  const [probeChannels, setProbeChannels] = useState<number | null>(null);
  const [levels, setLevels] = useState<number[]>([]);
  const [latency, setLatency] = useState<Latencies>({ base: null, output: null, input: null });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const maxPeaks = useRef<number[]>(new Array(MAX_CHANNELS).fill(-Infinity));

  const secure = window.isSecureContext && !!navigator.mediaDevices;

  // Mapeamento automático pelo nome (ex.: "Nano Cortex" -> Nano 3/4; Focusrite -> nenhum).
  const deviceLabel = devices.find((d) => d.deviceId === deviceId)?.label ?? '';
  const presetId = presetOverride ?? (/nano|cortex|neural/i.test(deviceLabel) ? 'nano-cortex' : '');

  const showError = useCallback(
    (err: unknown) => {
      const key = errorKey(err);
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setError(key ? `${t(key)} (${detail})` : detail);
    },
    [t],
  );

  const refresh = useCallback(async () => {
    const list = await listInputDevices();
    setDevices(list);
    setDeviceId((cur) => (cur && list.some((d) => d.deviceId === cur) ? cur : (list[0]?.deviceId ?? '')));
  }, []);

  useEffect(() => {
    if (!secure) return;
    const onChange = () => void refresh();
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange);
  }, [refresh, secure]);

  const askPermission = async () => {
    setError(null);
    try {
      await requestPermission();
      setPermission(true);
      await refresh();
    } catch (err) {
      showError(err);
    }
  };

  const close = useCallback(async () => {
    if (input) await input.close();
    setInput(null);
    setProbeChannels(null);
    setLevels([]);
  }, [input]);

  const open = async () => {
    setError(null);
    await close();
    maxPeaks.current = new Array(MAX_CHANNELS).fill(-Infinity);
    try {
      const li = await openLiveInput(deviceId, useAudioStore.getState().lowLatency);
      li.onProbe((r) => setProbeChannels(r.channels));
      setInput(li);
    } catch (err) {
      showError(err);
    }
  };

  // Fecha o dispositivo ao sair da página.
  useEffect(() => {
    return () => {
      void input?.close();
    };
  }, [input]);

  const shownChannels = Math.min(
    MAX_CHANNELS,
    Math.max(1, probeChannels ?? input?.settings.channelCount ?? 2),
  );

  // Loop de medição (~30 fps) + leitura de latência.
  useEffect(() => {
    if (!input) return;
    const buf = new Float32Array(new ArrayBuffer(input.analysers[0]!.fftSize * 4));
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 33) return;
      last = now;
      const next: number[] = [];
      for (let c = 0; c < shownChannels; c++) {
        const { peakDb } = readLevel(input.analysers[c]!, buf);
        next.push(peakDb);
        if (peakDb > maxPeaks.current[c]!) maxPeaks.current[c] = peakDb;
      }
      setLevels(next);
      const s = input.track.getSettings() as MediaTrackSettings & { latency?: number };
      setLatency({
        base: input.ctx.baseLatency ?? null,
        output: typeof input.ctx.outputLatency === 'number' ? input.ctx.outputLatency : null,
        input: typeof s.latency === 'number' ? s.latency : null,
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [input, shownChannels]);

  const preset = DEVICE_PRESETS.find((d) => d.id === presetId);
  const roleOf = (ch: number): string | null => {
    if (!preset?.usb) return null;
    if (preset.usb.di === ch) return t('diag.roleDI');
    if (preset.usb.processed?.includes(ch)) return t('diag.roleProcessed');
    return null;
  };

  const capsChannels = (() => {
    const c = input?.capabilities?.channelCount as { max?: number } | undefined;
    return c?.max ?? null;
  })();
  const total =
    latency.base == null && latency.output == null && latency.input == null
      ? null
      : (latency.base ?? 0) + (latency.output ?? 0) + (latency.input ?? 0);

  const fmt = (v: number | null | undefined, unit = '') =>
    v == null ? t('diag.unavailable') : `${v}${unit}`;

  const copyReport = async () => {
    if (!input) return;
    const report = {
      app: 'GhostEQ /diagnostico',
      date: new Date().toISOString(),
      userAgent: navigator.userAgent,
      device: devices.find((d) => d.deviceId === deviceId)?.label ?? '?',
      trackSettings: input.track.getSettings(),
      capabilitiesChannelCount: input.capabilities?.channelCount ?? null,
      sourceNodeChannelCount: input.source.channelCount,
      measuredChannels: probeChannels,
      contextSampleRate: input.ctx.sampleRate,
      lowLatency: useAudioStore.getState().lowLatency,
      latencyMs: {
        base: ms(latency.base),
        output: ms(latency.output),
        input: ms(latency.input),
        total: ms(total),
      },
      maxPeakDbPerChannel: maxPeaks.current
        .slice(0, shownChannels)
        .map((v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null)),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      showError(err);
    }
  };

  // Veredito: compara o que chegou com o que o dispositivo anuncia e,
  // separadamente, com o que o mapeamento escolhido (ex.: Nano 3/4) precisa.
  const verdictN = probeChannels ?? input?.settings.channelCount ?? null;
  const needed = preset?.usb ? Math.max(preset.usb.di ?? 0, ...(preset.usb.processed ?? [])) : 0;
  const verdicts: { cls: 'ok' | 'warn'; text: string }[] = [];
  if (verdictN != null) {
    if (capsChannels != null && verdictN < capsChannels)
      verdicts.push({ cls: 'warn', text: t('diag.verdictPartial', { n: verdictN, max: capsChannels }) });
    else verdicts.push({ cls: 'ok', text: t('diag.verdictAll', { n: verdictN }) });
    if (needed > 0)
      verdicts.push(
        verdictN >= needed
          ? { cls: 'ok', text: t('diag.verdictMappingOk', { need: needed }) }
          : { cls: 'warn', text: t('diag.verdictMapping', { n: verdictN, need: needed }) },
      );
  }

  return (
    <main className="page">
      <h1>{t('diag.title')}</h1>
      <p className="muted">{t('diag.intro')}</p>
      {!secure && <p className="error">{t('diag.errInsecure')}</p>}
      {error && (
        <p className="error" role="alert">
          {t('diag.errorPrefix')}: {error}
        </p>
      )}

      <section className="card">
        <h2>{t('diag.step1')}</h2>
        <button onClick={askPermission} disabled={!secure}>
          {t('diag.askPermission')}
        </button>
        {permission && <p className="ok">{t('diag.permissionOk')}</p>}
      </section>

      <section className="card">
        <h2>{t('diag.step2')}</h2>
        {permission && devices.length === 0 && <p>{t('diag.noDevices')}</p>}
        <div className="row">
          <select
            value={deviceId}
            onChange={(e) => {
              setDeviceId(e.target.value);
              setPresetOverride(null);
            }}
            disabled={!permission}
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || d.deviceId}
              </option>
            ))}
          </select>
          <button onClick={() => void refresh()} disabled={!permission} className="secondary">
            {t('diag.refresh')}
          </button>
        </div>
        <div className="row">
          <label>
            {t('diag.devicePreset')}{' '}
            <select value={presetId} onChange={(e) => setPresetOverride(e.target.value)}>
              <option value="">{t('diag.none')}</option>
              {DEVICE_PRESETS.filter((d) => d.usb).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <button onClick={open} disabled={!permission || !deviceId}>
            {t('diag.open')}
          </button>
          {input && (
            <button onClick={() => void close()} className="secondary">
              {t('diag.close')}
            </button>
          )}
        </div>
        <p className="muted small">{t('diag.noMonitor')}</p>
      </section>

      {input && (
        <section className="card">
          <h2>{t('diag.step3')}</h2>
          {verdicts.map((v) => (
            <p key={v.text} className={v.cls}>
              {v.text}
            </p>
          ))}
          <dl className="facts">
            <dt>{t('diag.channelsReal')}</dt>
            <dd>{probeChannels ?? t('diag.measuring')}</dd>
            <dt>{t('diag.channelsTrack')}</dt>
            <dd>{fmt(input.settings.channelCount)}</dd>
            <dt>{t('diag.channelsCaps')}</dt>
            <dd>{fmt(capsChannels)}</dd>
            <dt>{t('diag.channelsNode')}</dt>
            <dd>{input.source.channelCount}</dd>
            <dt>{t('diag.sampleRateCtx')}</dt>
            <dd>{input.ctx.sampleRate} Hz</dd>
            <dt>{t('diag.sampleRateTrack')}</dt>
            <dd>{fmt(input.settings.sampleRate, ' Hz')}</dd>
            <dt>{t('diag.baseLatency')}</dt>
            <dd>{fmt(ms(latency.base), ' ms')}</dd>
            <dt>{t('diag.outputLatency')}</dt>
            <dd>{fmt(ms(latency.output), ' ms')}</dd>
            <dt>{t('diag.trackLatency')}</dt>
            <dd>{fmt(ms(latency.input), ' ms')}</dd>
            <dt>{t('diag.totalLatency')}</dt>
            <dd>
              <strong>{fmt(ms(total), ' ms')}</strong>
            </dd>
          </dl>
          {total != null && total > 0.03 && <p className="muted small">{t('diag.latencyHigh')}</p>}

          <h3>{t('diag.meters')}</h3>
          <p className="muted small">{t('diag.meterHint')}</p>
          <div className="meters">
            {Array.from({ length: shownChannels }, (_, c) => (
              <LevelMeter
                key={c}
                label={t('diag.channel', { n: c + 1 })}
                sublabel={roleOf(c + 1)}
                db={levels[c] ?? -Infinity}
              />
            ))}
          </div>

          <div className="row">
            <button onClick={copyReport}>{t('diag.copyReport')}</button>
            {copied && <span className="ok">{t('diag.copied')}</span>}
          </div>
        </section>
      )}

      <MeasurementTable />
    </main>
  );
}
