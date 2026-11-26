import { GRAPHIC_LAYOUTS, GRAPHIC_RANGE_DB, type GraphicMode, type GraphicState } from '../../dsp/modes';
import { useT } from '../../i18n';
import { graphicStateOf } from '../../model/modes';
import { useCurveStore } from '../../state/curveStore';
import { GestureRange } from '../common/GestureRange';
import { formatTickHz } from '../common/format';
import { CutFilterControl, useImpreciseText } from './shared';

/** Sliders verticais do equalizador gráfico (9, 10 ou 31 bandas). */
export function GraphicPanel({ mode }: { mode: GraphicMode }) {
  const { t } = useT();
  const modeState = useCurveStore((s) => s.curve.modeState);
  const state = graphicStateOf(mode, modeState);
  const imprecise = useImpreciseText();
  const { freqs } = GRAPHIC_LAYOUTS[mode];
  const R = GRAPHIC_RANGE_DB;

  const update = (next: GraphicState) => useCurveStore.getState().setModeState(mode, next);
  const setGain = (i: number, g: number) =>
    update({ ...state, gainsDb: state.gainsDb.map((x, j) => (j === i ? g : x)) });

  return (
    <section className="card">
      <div className="panel-head">
        <h2>
          {t('graphic.title')} · {freqs.length}
        </h2>
        <button className="secondary" onClick={() => update({ ...state, gainsDb: freqs.map(() => 0) })}>
          {t('mode.flatAll')}
        </button>
      </div>
      {mode === 'graphic9' && <p className="muted small">{t('graphic.nanoNote')}</p>}
      {freqs.length > 10 && <p className="muted small">{t('graphic.scrollHint')}</p>}

      <div className={`graphic-sliders${freqs.length > 10 ? ' dense' : ''}`}>
        {freqs.map((f, i) => {
          const g = state.gainsDb[i] ?? 0;
          const warn = imprecise(`${mode}-${i}`);
          return (
            <div key={f} className={`gslider${warn ? ' warn-col' : ''}`} title={warn ?? undefined}>
              <span className="gval">{g > 0 ? `+${g.toFixed(1)}` : g.toFixed(1)}</span>
              <GestureRange
                className="vertical"
                min={-R}
                max={R}
                step={0.1}
                value={g}
                onChange={(e) => setGain(i, Number(e.target.value))}
                onDoubleClick={() => setGain(i, 0)}
                aria-label={`${formatTickHz(f)} Hz`}
              />
              <span className="gfreq">{formatTickHz(f)}</span>
              {warn && (
                <span className="gwarn" aria-label={t('mode.imprecise')}>
                  ⚠
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="row">
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
