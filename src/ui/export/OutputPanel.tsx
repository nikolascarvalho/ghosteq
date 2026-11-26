import { useMemo, useState } from 'react';
import { resolveDevice } from '../../config/devices';
import { useT } from '../../i18n';
import { exportFileName } from '../../io/fileName';
import { downloadFile, WAV_MIME } from '../../io/files';
import { encodeWav, type WavSampleFormat } from '../../io/wavEncode';
import { selectCabInput, useCabStore } from '../../state/cabStore';
import { useCurveStore } from '../../state/curveStore';
import { useIrStore } from '../../state/irStore';
import { computeIr } from '../../workers/irEngine';
import { GestureRange } from '../common/GestureRange';
import { formatDb } from '../common/format';

const METER_MIN = -24;
const METER_MAX = 24;

export function OutputPanel() {
  const { t } = useT();
  const curve = useCurveStore((s) => s.curve);
  const { setOutputGain } = useCurveStore.getState();
  const result = useIrStore((s) => s.result);
  const preferred = useIrStore((s) => s.preferredFormat);
  const setPreferred = useIrStore((s) => s.setPreferredFormat);
  const [exported, setExported] = useState<string | null>(null);

  // Seleciona peças estáveis (selecionar um objeto novo a cada leitura faria o
  // React re-renderizar sem parar) e monta a entrada só quando elas mudam.
  const cab = useCabStore((s) => s.cab);
  const cabEnabled = useCabStore((s) => s.enabled);
  const cabInput = useMemo(() => selectCabInput({ cab, enabled: cabEnabled }), [cab, cabEnabled]);
  const cabName = cabEnabled ? cab?.name : undefined;
  const device = resolveDevice(curve.devicePresetId, curve.customDevice);
  const fileName = exportFileName(curve, device, { cabName });
  const peakDb = result ? 20 * Math.log10(result.peak) : null;
  const pct = (db: number) =>
    ((Math.min(METER_MAX, Math.max(METER_MIN, db)) - METER_MIN) / (METER_MAX - METER_MIN)) * 100;
  const forced = result?.exportFormat.forcedFloat ?? false;

  const exportWav = () => {
    // Recalcula na hora com a curva ATUAL (mesma função pura do worker, então o
    // resultado é idêntico ao IR mostrado/ouvido) e evita exportar um IR atrasado.
    const r = computeIr({ id: 0, curve, preferredFormat: preferred, cab: cabInput });
    const wav = encodeWav([r.ir], { sampleRate: r.sampleRate, format: r.exportFormat.format });
    downloadFile(wav, fileName, WAV_MIME);
    setExported(fileName);
  };

  return (
    <section className="card">
      <h2>{t('output.title')}</h2>

      <div className="slider-row">
        <span>{t('output.gain')}</span>
        <GestureRange
          min={-24}
          max={24}
          step={0.1}
          value={curve.outputGainDb}
          onChange={(e) => setOutputGain(Number(e.target.value))}
          onDoubleClick={() => setOutputGain(0)}
          aria-label={t('output.gain')}
        />
        <input
          className="num"
          type="number"
          step={0.1}
          value={Math.round(curve.outputGainDb * 10) / 10}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) setOutputGain(n);
          }}
          aria-label={`${t('output.gain')} (dB)`}
        />
        <span className="unit">dB</span>
      </div>

      <div className="peak-meter">
        <div className="peak-label">
          <span>{t('output.peak')}</span>
          <strong className={peakDb !== null && peakDb > 0 ? 'warn' : ''}>
            {peakDb === null ? t('common.computing') : `${formatDb(peakDb)}FS (${result!.peak.toFixed(3)})`}
          </strong>
        </div>
        <div className="peak-track" aria-hidden>
          <div className="peak-zero" style={{ left: `${pct(0)}%` }} />
          {peakDb !== null && (
            <div className={`peak-fill${peakDb > 0 ? ' over' : ''}`} style={{ width: `${pct(peakDb)}%` }} />
          )}
        </div>
        <div className="peak-scale" aria-hidden>
          <span>{METER_MIN}</span>
          <span>0 dBFS</span>
          <span>+{METER_MAX}</span>
        </div>
      </div>

      <fieldset className="format">
        <legend>{t('output.format')}</legend>
        {(['pcm24', 'float32'] as WavSampleFormat[]).map((f) => (
          <label key={f} className="check">
            <input
              type="radio"
              name="wav-format"
              value={f}
              checked={(forced ? 'float32' : preferred) === f}
              disabled={forced && f === 'pcm24'}
              onChange={() => setPreferred(f)}
            />
            {t(f === 'pcm24' ? 'output.pcm24' : 'output.float32')}
          </label>
        ))}
      </fieldset>
      {forced && <p className="warn small">{t('output.forcedFloat')}</p>}

      <div className="export-row">
        <button className="primary-big" onClick={exportWav}>
          ⬇ {t('output.export')}
        </button>
        <code className="filename">{fileName}</code>
      </div>
      {exported && (
        <p className="ok small" role="status">
          {t('output.exported', { name: exported })}
        </p>
      )}
    </section>
  );
}
