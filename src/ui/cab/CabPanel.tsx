import { useRef } from 'react';
import { resolveDevice } from '../../config/devices';
import { useT, type MessageKey } from '../../i18n';
import { readFileAsArrayBuffer } from '../../io/files';
import { MAX_CAB_SECONDS, useCabStore } from '../../state/cabStore';
import { useCurveStore } from '../../state/curveStore';
import { samplesToMs } from '../common/format';

/** Importar um IR de caixa e juntá-lo ao EQ num único arquivo. */
export function CabPanel() {
  const { t } = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const cab = useCabStore((s) => s.cab);
  const enabled = useCabStore((s) => s.enabled);
  const error = useCabStore((s) => s.error);
  const { loadFromBuffer, setDownmix, setEnabled, remove } = useCabStore.getState();
  const curve = useCurveStore((s) => s.curve);
  const device = resolveDevice(curve.devicePresetId, curve.customDevice);

  const frames = cab?.samples.length ?? 0;
  const framesAtDevice = cab ? Math.round((frames * device.sampleRate) / cab.sampleRate) : 0;

  return (
    <section className="card">
      <h2>{t('cab.title')}</h2>
      <p className="muted small">{t('cab.intro')}</p>

      <div className="row">
        <button className={cab ? 'secondary' : ''} onClick={() => fileRef.current?.click()}>
          {cab ? t('cab.replace') : t('cab.choose')}
        </button>
        {cab && (
          <button className="secondary danger" onClick={() => void remove()}>
            {t('cab.remove')}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".wav,audio/wav,audio/x-wav,audio/wave"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) await loadFromBuffer(await readFileAsArrayBuffer(f), f.name);
          }}
        />
      </div>

      {error && (
        <p className="error small" role="alert">
          {t(`cab.err.${error.code}` as MessageKey, { detail: error.detail })}
        </p>
      )}

      {cab && (
        <div className="cab-info">
          <label className="check">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            {t('cab.use')}
          </label>
          <p className="small">
            <strong>
              {t('cab.info', {
                name: cab.name,
                sr: cab.sampleRate / 1000,
                ch: cab.channels.length > 1 ? t('cab.stereo') : t('cab.mono'),
                ms: samplesToMs(frames, cab.sampleRate),
              })}
            </strong>
          </p>

          {cab.channels.length > 1 && (
            <fieldset className="format">
              <legend className="warn">{t('cab.stereoWarn')}</legend>
              {(['left', 'mix'] as const).map((m) => (
                <label key={m} className="check">
                  <input
                    type="radio"
                    name="cab-downmix"
                    checked={cab.downmix === m}
                    onChange={() => setDownmix(m)}
                  />
                  {t(m === 'left' ? 'cab.left' : 'cab.mix')}
                </label>
              ))}
            </fieldset>
          )}

          {cab.sampleRate !== device.sampleRate && (
            <p className="muted small">
              {t('cab.resampleNote', { from: cab.sampleRate / 1000, to: device.sampleRate / 1000 })}
            </p>
          )}
          {framesAtDevice > device.irLength && (
            <p className="muted small">{t('cab.truncNote', { n: framesAtDevice, len: device.irLength })}</p>
          )}
          {cab.trimmed && <p className="warn small">{t('cab.trimmedNote', { s: MAX_CAB_SECONDS })}</p>}
          <p className="muted small">{t('cab.notInPresets')}</p>
        </div>
      )}
    </section>
  );
}
