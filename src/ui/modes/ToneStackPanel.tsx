import { TONESTACK, TONESTACK_RANGE_DB, type ToneStackState } from '../../dsp/modes';
import { useT } from '../../i18n';
import { toneStackStateOf } from '../../model/modes';
import { useCurveStore } from '../../state/curveStore';
import { Knob } from '../common/Knob';
import { formatDb, formatHz } from '../common/format';
import { CutFilterControl, useImpreciseText } from './shared';

const R = TONESTACK_RANGE_DB;
/** dB ↔ escala de amp 0–10 (5 = flat). */
const toDial = (db: number) => 5 + (db / R) * 5;
const fromDial = (d: number) => ((d - 5) / 5) * R;

type KnobKey = 'bassDb' | 'midDb' | 'trebleDb' | 'presenceDb';
const KNOBS: {
  key: KnobKey;
  label: 'tonestack.bass' | 'tonestack.mid' | 'tonestack.treble' | 'tonestack.presence';
  id: string;
}[] = [
  { key: 'bassDb', label: 'tonestack.bass', id: 'ts-bass' },
  { key: 'midDb', label: 'tonestack.mid', id: 'ts-mid' },
  { key: 'trebleDb', label: 'tonestack.treble', id: 'ts-treble' },
  { key: 'presenceDb', label: 'tonestack.presence', id: 'ts-presence' },
];

export function ToneStackPanel() {
  const { t } = useT();
  const modeState = useCurveStore((s) => s.curve.modeState);
  const state = toneStackStateOf(modeState);
  const imprecise = useImpreciseText();
  const update = (next: ToneStackState) => useCurveStore.getState().setModeState('tonestack', next);

  return (
    <section className="card">
      <div className="panel-head">
        <h2>{t('tonestack.title')}</h2>
        <button
          className="secondary"
          onClick={() => update({ ...state, bassDb: 0, midDb: 0, trebleDb: 0, presenceDb: 0 })}
        >
          {t('mode.flatAll')}
        </button>
      </div>
      <p className="muted small">{t('tonestack.hint')}</p>
      <div className="knob-row">
        {KNOBS.map(({ key, label, id }) => (
          <Knob
            key={key}
            label={t(label)}
            value={toDial(state[key])}
            min={0}
            max={10}
            step={0.1}
            defaultValue={5}
            display={toDial(state[key]).toFixed(1)}
            subDisplay={formatDb(state[key])}
            warn={imprecise(id)}
            onChange={(d) => update({ ...state, [key]: Math.round(fromDial(d) * 10) / 10 })}
          />
        ))}
      </div>
      <div className="row">
        <label className="field">
          {t('tonestack.midFreq')}
          <select
            value={state.midFreq}
            onChange={(e) => update({ ...state, midFreq: Number(e.target.value) })}
          >
            {TONESTACK.midFreqs.map((f) => (
              <option key={f} value={f}>
                {formatHz(f)}
              </option>
            ))}
          </select>
        </label>
        <CutFilterControl
          label={t('mode.hpf')}
          value={state.hpf}
          onChange={(hpf) => update({ ...state, hpf })}
        />
        <CutFilterControl
          label={t('mode.lpf')}
          value={state.lpf}
          onChange={(lpf) => update({ ...state, lpf })}
        />
      </div>
    </section>
  );
}
