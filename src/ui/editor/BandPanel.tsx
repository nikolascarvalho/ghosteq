import { useT } from '../../i18n';
import { FILTER_TYPES, LIMITS, type Band } from '../../model/curve';
import { useCurveStore } from '../../state/curveStore';
import { useIrStore } from '../../state/irStore';
import { GestureRange } from '../common/GestureRange';
import { formatDb, formatHz, formatQ } from '../common/format';
import { bandColor, hasGain } from './bandStyle';
import { freqToSlider, sliderToFreq } from './scale';

const Q_MIN = 0.1;
const Q_MAX = 20;
const qToSlider = (q: number) => Math.log(q / Q_MIN) / Math.log(Q_MAX / Q_MIN);
const sliderToQ = (t: number) => Q_MIN * Math.pow(Q_MAX / Q_MIN, t);

interface Props {
  bandId: string | null;
  onSelect: (id: string | null) => void;
}

/** Controles da banda selecionada + lista de todas as bandas. */
export function BandPanel({ bandId, onSelect }: Props) {
  const { t } = useT();
  const bands = useCurveStore((s) => s.curve.bands);
  const deviations = useIrStore((s) => s.result?.bandDeviations);
  const irLength = useIrStore((s) => s.result?.length ?? 0);
  const { updateBand, removeBand, toggleBand } = useCurveStore.getState();
  const index = bands.findIndex((b) => b.id === bandId);
  const band = index >= 0 ? bands[index] : undefined;
  const dev = deviations?.find((d) => d.bandId === bandId);

  const set = (patch: Partial<Omit<Band, 'id'>>) => band && updateBand(band.id, patch);
  const num = (v: string) => {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  return (
    <section className="card">
      <h2>{t('band.list')}</h2>
      <div className="band-chips" role="list">
        {bands.map((b, i) => (
          <div
            key={b.id}
            role="listitem"
            className={`band-chip${b.id === bandId ? ' selected' : ''}${b.enabled ? '' : ' off'}`}
          >
            <input
              type="checkbox"
              checked={b.enabled}
              onChange={() => toggleBand(b.id)}
              aria-label={`${t('band.enabled')} ${i + 1}`}
            />
            <button className="chip-label" onClick={() => onSelect(b.id)}>
              <span className="swatch" style={{ background: bandColor(i) }}>
                {i + 1}
              </span>
              {t(`band.type.${b.type}`)} · {formatHz(b.freq)}
              {hasGain(b.type) ? ` · ${formatDb(b.gainDb)}` : ''}
              {deviations?.find((d) => d.bandId === b.id)?.imprecise ? ' ⚠' : ''}
            </button>
          </div>
        ))}
      </div>

      {!band ? (
        <p className="muted small">{t('band.none')}</p>
      ) : (
        <div className="band-editor">
          <div className="row">
            <span className="swatch" style={{ background: bandColor(index) }}>
              {index + 1}
            </span>
            <label className="field">
              {t('band.type')}
              <select value={band.type} onChange={(e) => set({ type: e.target.value as Band['type'] })}>
                {FILTER_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {t(`band.type.${ft}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={band.enabled} onChange={() => toggleBand(band.id)} />
              {t('band.enabled')}
            </label>
            <button
              className="secondary danger"
              onClick={() => {
                removeBand(band.id);
                onSelect(null);
              }}
            >
              {t('band.remove')}
            </button>
          </div>

          {dev?.imprecise && (
            <p className="warn small">
              ⚠ {t('band.imprecise', { d: formatDb(Math.abs(dev.deviationDb)), n: irLength })}
            </p>
          )}

          <div className="slider-row">
            <span>{t('band.freq')}</span>
            <GestureRange
              min={0}
              max={1000}
              value={Math.round(freqToSlider(band.freq) * 1000)}
              onChange={(e) => set({ freq: Math.round(sliderToFreq(Number(e.target.value) / 1000)) })}
              aria-label={t('band.freq')}
            />
            <input
              className="num"
              type="number"
              min={LIMITS.freq.min}
              max={LIMITS.freq.max}
              value={Math.round(band.freq)}
              onChange={(e) => {
                const n = num(e.target.value);
                if (n !== null) set({ freq: n });
              }}
              aria-label={`${t('band.freq')} (Hz)`}
            />
            <span className="unit">Hz</span>
          </div>

          {hasGain(band.type) && (
            <div className="slider-row">
              <span>{t('band.gain')}</span>
              <GestureRange
                min={-18}
                max={18}
                step={0.1}
                value={band.gainDb}
                onChange={(e) => set({ gainDb: Number(e.target.value) })}
                onDoubleClick={() => set({ gainDb: 0 })}
                aria-label={t('band.gain')}
              />
              <input
                className="num"
                type="number"
                step={0.1}
                value={Math.round(band.gainDb * 10) / 10}
                onChange={(e) => {
                  const n = num(e.target.value);
                  if (n !== null) set({ gainDb: n });
                }}
                aria-label={`${t('band.gain')} (dB)`}
              />
              <span className="unit">dB</span>
            </div>
          )}

          <div className="slider-row">
            <span>{t('band.q')}</span>
            <GestureRange
              min={0}
              max={1000}
              value={Math.round(qToSlider(Math.min(Q_MAX, Math.max(Q_MIN, band.q))) * 1000)}
              onChange={(e) => set({ q: Math.round(sliderToQ(Number(e.target.value) / 1000) * 100) / 100 })}
              aria-label={t('band.q')}
            />
            <input
              className="num"
              type="number"
              step={0.01}
              min={LIMITS.q.min}
              max={LIMITS.q.max}
              value={formatQ(band.q)}
              onChange={(e) => {
                const n = num(e.target.value);
                if (n !== null && n > 0) set({ q: n });
              }}
              aria-label={t('band.q')}
            />
            <span className="unit" />
          </div>
        </div>
      )}
    </section>
  );
}
