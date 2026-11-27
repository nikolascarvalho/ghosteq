import { useState } from 'react';
import { useT } from '../../i18n';
import { MEASURE_ROWS, rowKey, toMarkdown, useMeasureStore } from '../../state/measureStore';

/** Roteiro de medição: tabela para preencher (Chrome × Edge, baixa latência, saída). */
export function MeasurementTable() {
  const { t } = useT();
  const entries = useMeasureStore((s) => s.entries);
  const update = useMeasureStore((s) => s.update);
  const [copied, setCopied] = useState(false);

  const labels = {
    browser: t('diag.col.browser'),
    lowLatency: t('diag.col.lowLatency'),
    output: t('diag.col.output'),
    total: t('diag.col.total'),
    crackle: t('diag.col.crackle'),
    notes: t('diag.col.notes'),
    on: t('diag.val.on'),
    off: t('diag.val.off'),
    yes: t('diag.val.yes'),
    no: t('diag.val.no'),
    pc: t('diag.val.pc'),
    nano: t('diag.val.nano'),
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toMarkdown(entries, labels));
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      /* sem permissão de área de transferência */
    }
  };

  return (
    <section className="card">
      <h2>{t('diag.measureTitle')}</h2>
      <p className="muted small">{t('diag.measureIntro')}</p>
      <ol className="small">
        {(
          [
            'diag.measureStep1',
            'diag.measureStep2',
            'diag.measureStep3',
            'diag.measureStep4',
            'diag.measureStep5',
          ] as const
        ).map((k) => (
          <li key={k}>{t(k)}</li>
        ))}
      </ol>
      <div className="measure-scroll">
        <table className="measure-table small">
          <thead>
            <tr>
              <th>{labels.browser}</th>
              <th>{labels.lowLatency}</th>
              <th>{labels.output}</th>
              <th>{labels.total}</th>
              <th>{labels.crackle}</th>
              <th>{labels.notes}</th>
            </tr>
          </thead>
          <tbody>
            {MEASURE_ROWS.map((r) => {
              const key = rowKey(r);
              const e = entries[key];
              return (
                <tr key={key}>
                  <td>{r.browser === 'chrome' ? 'Chrome' : 'Edge'}</td>
                  <td>{r.lowLatency ? labels.on : labels.off}</td>
                  <td>{r.output === 'pc' ? labels.pc : labels.nano}</td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="num"
                      value={e?.totalMs ?? ''}
                      onChange={(ev) => update(key, { totalMs: ev.target.value })}
                      aria-label={`${labels.total} ${key}`}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={e?.crackle ?? false}
                      onChange={(ev) => update(key, { crackle: ev.target.checked })}
                      aria-label={`${labels.crackle} ${key}`}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={e?.notes ?? ''}
                      onChange={(ev) => update(key, { notes: ev.target.value })}
                      aria-label={`${labels.notes} ${key}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button onClick={() => void copy()}>{t('diag.copyTable')}</button>
        <button
          className="secondary"
          onClick={() => {
            if (window.confirm(t('diag.confirmClear'))) useMeasureStore.getState().clear();
          }}
        >
          {t('diag.clearTable')}
        </button>
        {copied && <span className="ok">{t('diag.tableCopied')}</span>}
      </div>
      <p className="muted small">{t('live.latencyFloor')}</p>
    </section>
  );
}
