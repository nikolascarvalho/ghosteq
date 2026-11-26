import { useEffect, useRef, useState } from 'react';
import { channelOptions } from '../../audio/helpers';
import { readLevel } from '../../audio/liveInput';
import { LOOP_STYLES } from '../../audio/placeholderLoops';
import { useT, type MessageKey } from '../../i18n';
import { getEngine, supportsSinkId, useAudioStore, type SourceKind } from '../../state/audioStore';
import { LevelMeter } from '../common/LevelMeter';
import { formatDb } from '../common/format';
import { SpectrumCanvas } from './SpectrumCanvas';

/** Re-renderiza a cada `ms` enquanto ativo (medidores, latência, limiter). */
function useTick(active: boolean, ms = 100) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}

const msText = (s: number | null) => (s == null ? '?' : (s * 1000).toFixed(1));

export function LivePanel() {
  const { t } = useT();
  const s = useAudioStore();
  const [tab, setTab] = useState<SourceKind>('live');
  const fileRef = useRef<HTMLInputElement>(null);
  useTick(s.on);

  // Esc = pânico (mudo instantâneo), enquanto o áudio estiver ligado.
  useEffect(() => {
    if (!s.on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useAudioStore.getState().panic();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.on]);

  const engine = getEngine();
  const lat = engine?.latency();
  const total =
    lat && (lat.base != null || lat.output != null)
      ? (lat.base ?? 0) + (lat.output ?? 0) + (s.source === 'live' ? (s.trackLatency ?? 0) : 0)
      : null;
  const reduction = engine?.limiterReductionDb ?? 0;

  // Níveis por canal da entrada ao vivo.
  const levels: number[] = [];
  if (engine && s.source === 'live') {
    const buf = new Float32Array(2048);
    for (const a of engine.liveChannelAnalysers) levels.push(readLevel(a, buf).peakDb);
  }
  const selected = channelOptions(s.channelCount).find((o) => o.id === s.channelSel)?.channels ?? [];
  const isNanoInput = /nano|cortex|neural/i.test(s.inputs.find((d) => d.deviceId === s.inputId)?.label ?? '');

  return (
    <section className="card live">
      <div className="panel-head">
        <h2>{t('live.title')}</h2>
        {s.on ? (
          <button className="secondary" onClick={() => void s.powerOff()}>
            {t('live.powerOff')}
          </button>
        ) : (
          <button onClick={() => void s.powerOn()}>🎧 {t('live.powerOn')}</button>
        )}
      </div>
      <p className="muted small">{t('live.intro')}</p>

      {s.on && (
        <>
          <ul className="warn-list small">
            <li>{t('live.warnPhysical')}</li>
            <li>{t('live.warnFlat')}</li>
            <li>{t('live.warnLatency')}</li>
          </ul>

          {s.error && (
            <p className="error small" role="alert">
              {t(`live.err.${s.error.code}` as MessageKey, { detail: s.error.detail })}
            </p>
          )}

          <div className="mode-tabs" role="tablist">
            {(['live', 'file', 'example'] as SourceKind[]).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                className={tab === k ? 'tab active' : 'tab'}
                onClick={() => setTab(k)}
              >
                {t(`live.src.${k}` as MessageKey)}
              </button>
            ))}
          </div>

          {tab === 'live' && (
            <div className="live-source">
              <div className="row">
                <label className="field">
                  {t('live.input')}
                  <select value={s.inputId} onChange={(e) => s.setInputId(e.target.value)}>
                    {s.inputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || d.deviceId.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
                <button onClick={() => void s.startLive()}>🎸 {t('live.startLive')}</button>
              </div>
              {s.source === 'live' && (
                <>
                  <div className="row">
                    <label className="field">
                      {t('live.channels')}
                      <select value={s.channelSel} onChange={(e) => void s.setChannelSel(e.target.value)}>
                        {channelOptions(s.channelCount).map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.id}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {isNanoInput && <p className="muted small">{t('live.channelHintNano')}</p>}
                  <div className="meters">
                    {levels.map((db, i) => (
                      <LevelMeter
                        key={i}
                        label={`${i + 1}`}
                        sublabel={selected.includes(i) ? '▶' : null}
                        db={db}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'file' && (
            <div className="live-source">
              <p className="muted small">{t('live.fileHint')}</p>
              <button onClick={() => fileRef.current?.click()}>{t('live.chooseFile')}</button>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void s.playFile(f);
                }}
              />
            </div>
          )}

          {tab === 'example' && (
            <div className="live-source">
              <p className="muted small">{t('live.exampleHint')}</p>
              <div className="row">
                {LOOP_STYLES.map((st) => (
                  <button
                    key={st}
                    className={s.source === 'example' && s.playing === st ? '' : 'secondary'}
                    onClick={() => void s.playExample(st)}
                  >
                    ▶ {t(`live.example.${st}` as MessageKey)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {s.playing && (
            <div className="row">
              <span className="ok small">
                {t('live.playing', {
                  name: s.source === 'example' ? t(`live.example.${s.playing}` as MessageKey) : s.playing,
                })}
              </span>
              {s.placeholder && <span className="warn small">({t('live.placeholder')})</span>}
              <button className="secondary" onClick={s.stop}>
                ■ {t('live.stop')}
              </button>
            </div>
          )}

          <div className="ab-switch" role="group" aria-label="A/B">
            {(['A', 'B'] as const).map((ab) => (
              <button key={ab} className={s.ab === ab ? 'ab active' : 'ab'} onClick={() => s.setAB(ab)}>
                {t(ab === 'A' ? 'live.abA' : 'live.abB')}
              </button>
            ))}
          </div>
          <label className="check small">
            <input type="checkbox" checked={s.match} onChange={(e) => s.setMatch(e.target.checked)} />
            {t('live.match')}
          </label>

          <div className="slider-row">
            <span>{t('live.volume')}</span>
            <input
              type="range"
              min={-60}
              max={0}
              step={0.5}
              value={s.volumeDb}
              onChange={(e) => s.setVolumeDb(Number(e.target.value))}
              aria-label={t('live.volume')}
            />
            <span className="num-display">{formatDb(s.volumeDb)}</span>
            <span />
          </div>
          <p className={`small ${reduction < -1 ? 'warn' : 'muted'}`}>
            {t('live.limiter', { db: formatDb(reduction) })}
            {s.muted && <strong className="error"> · {t('live.muted')}</strong>}
          </p>

          {supportsSinkId() && s.outputs.length > 0 && (
            <label className="field">
              {t('live.output')}
              <select value={s.sinkId} onChange={(e) => void s.setSink(e.target.value)}>
                <option value="">{t('live.outputDefault')}</option>
                {s.outputs
                  .filter((d) => d.deviceId !== 'default')
                  .map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || d.deviceId.slice(0, 8)}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {lat && (
            <p className="muted small">
              {t('live.latency', {
                ms: msText(total),
                base: msText(lat.base),
                out: msText(lat.output),
                inp:
                  s.source === 'live' && s.trackLatency != null
                    ? t('live.latencyInput', { ms: msText(s.trackLatency) })
                    : '',
              })}
            </p>
          )}

          <p className="muted small">{t('live.spectrum')}</p>
          <SpectrumCanvas />
        </>
      )}
    </section>
  );
}
