import { useT } from '../../i18n';
import { useIrStore } from '../../state/irStore';
import { formatDb, formatHz, samplesToMs } from '../common/format';

/** Aviso "curva real × pedida", com explicação simples da limitação do tamanho do IR. */
export function DeviationNotice() {
  const { t } = useT();
  const result = useIrStore((s) => s.result);
  if (!result) return null;
  const { deviation, length, sampleRate } = result;
  const ok = deviation.regions.length === 0;

  // As 2 regiões com maior desvio, em ordem de frequência.
  const worst = [...deviation.regions]
    .sort((a, b) => Math.abs(b.worstDb) - Math.abs(a.worstDb))
    .slice(0, 2)
    .sort((a, b) => a.fLow - b.fLow);
  const range = worst.map((r) => `${formatHz(r.fLow)}–${formatHz(r.fHigh)}`).join(', ');

  return (
    <section className={`notice ${ok ? 'notice-ok' : 'notice-warn'}`} aria-live="polite">
      <strong>{t('dev.title')}: </strong>
      {ok
        ? t('dev.ok', { d: formatDb(deviation.maxAbsDb) })
        : t('dev.warn', { d: formatDb(Math.abs(deviation.maxAbsDb)), range })}
      {!ok && (
        <details>
          <summary>{t('dev.explainTitle')}</summary>
          <p className="small">{t('dev.explain', { n: length, ms: samplesToMs(length, sampleRate) })}</p>
        </details>
      )}
    </section>
  );
}
