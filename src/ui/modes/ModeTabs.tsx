import { useState } from 'react';
import { useT, type MessageKey } from '../../i18n';
import { EQ_MODES, type EqMode } from '../../model/curve';
import { isFlat, isGraphicMode } from '../../model/modes';
import { useCurveStore } from '../../state/curveStore';

/** Abas de modo. Avisa antes de conversões que perdem informação. */
export function ModeTabs() {
  const { t } = useT();
  const mode = useCurveStore((s) => s.curve.mode);
  const [note, setNote] = useState<string | null>(null);

  const choose = (next: EqMode) => {
    if (next === mode) return;
    const { curve, setMode } = useCurveStore.getState();
    const label = t(`mode.${next}` as MessageKey);
    if (next !== 'parametric' && !isFlat(curve.bands)) {
      const msg = isGraphicMode(next)
        ? t('mode.confirmFit', { mode: label })
        : t('mode.confirmReplace', { mode: label });
      if (!window.confirm(msg)) return;
    }
    setMode(next);
    setNote(next === 'parametric' && mode !== 'parametric' ? t('mode.toParametric') : null);
  };

  return (
    <div className="mode-tabs-wrap">
      <div className="mode-tabs" role="tablist" aria-label={t('mode.label')}>
        {EQ_MODES.map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={m === mode}
            className={m === mode ? 'tab active' : 'tab'}
            onClick={() => choose(m)}
          >
            {t(`mode.${m}` as MessageKey)}
          </button>
        ))}
      </div>
      {note && (
        <p className="ok small" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
