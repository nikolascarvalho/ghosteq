import { TILT_PIVOTS, TILT_RANGE_DB, type TiltState } from '../../dsp/modes';
import { useT } from '../../i18n';
import { tiltStateOf } from '../../model/modes';
import { useCurveStore } from '../../state/curveStore';
import { Knob } from '../common/Knob';
import { formatDb, formatHz } from '../common/format';
import { useImpreciseText } from './shared';

export function TiltPanel() {
  const { t } = useT();
  const modeState = useCurveStore((s) => s.curve.modeState);
  const state = tiltStateOf(modeState);
  const imprecise = useImpreciseText();
  const update = (next: TiltState) => useCurveStore.getState().setModeState('tilt', next);

  return (
    <section className="card">
      <h2>{t('tilt.title')}</h2>
      <p className="muted small">{t('tilt.hint')}</p>
      <div className="knob-row">
        <Knob
          label={t('tilt.amount')}
          value={state.tiltDb}
          min={-TILT_RANGE_DB}
          max={TILT_RANGE_DB}
          step={0.1}
          defaultValue={0}
          size={96}
          display={formatDb(state.tiltDb)}
          warn={imprecise('tilt-low') ?? imprecise('tilt-high')}
          onChange={(v) => update({ ...state, tiltDb: Math.round(v * 10) / 10 })}
        />
        <label className="field">
          {t('tilt.pivot')}
          <select
            value={state.pivotHz}
            onChange={(e) => update({ ...state, pivotHz: Number(e.target.value) })}
          >
            {TILT_PIVOTS.map((f) => (
              <option key={f} value={f}>
                {formatHz(f)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
