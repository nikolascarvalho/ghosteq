import { useState } from 'react';
import { isNanoLabel } from '../../audio/helpers';
import {
  formatDiagnostic,
  LATENCY_KEYS,
  latencyTotal,
  msText,
  rateIssues,
  type LatencyParts,
} from '../../audio/latency';
import { useT, type MessageKey } from '../../i18n';
import { getEngine, useAudioStore } from '../../state/audioStore';
import { rowKey, useMeasureStore, type MeasureRow } from '../../state/measureStore';

const TIP_KEYS = ['rate', 'enhance', 'close', 'usb', 'phones', 'power'] as const;

/**
 * Tudo sobre latência no modo ao vivo: modo baixa latência, aviso de estalos,
 * taxas de amostragem, dicas para Windows, total + parcelas e diagnóstico.
 * Re-renderiza junto com o LivePanel (que atualiza a cada 100 ms).
 */
export function LatencyPanel() {
  const { t } = useT();
  const s = useAudioStore();
  const [msg, setMsg] = useState<string | null>(null);
  const engine = getEngine();
  if (!engine) return null;

  const isLive = s.source === 'live';
  const lat = engine.latency();
  const sr = engine.ctx.sampleRate;
  const graphS = s.graphDelay ? Math.max(s.graphDelay.dry, s.graphDelay.wet, 0) / sr : null;
  const parts: LatencyParts = {
    input: isLive ? s.trackLatency : 0,
    base: lat.base,
    output: lat.output,
    graph: graphS,
  };
  const { total, missing } = latencyTotal(parts);
  const glitches = engine.glitchStats();

  const inputLabel = s.inputs.find((d) => d.deviceId === s.inputId)?.label ?? '';
  const outputLabel = s.outputs.find((d) => d.deviceId === s.sinkId)?.label ?? '';
  const outputIsNano = !!s.sinkId && isNanoLabel(outputLabel);
  const rates = { context: sr, input: isLive ? s.trackSampleRate : null, output: s.outputRate };
  const issues = rateIssues(rates);

  const partValue = (k: keyof LatencyParts): string => {
    if (k === 'input' && !isLive) return t('live.lat.inputNA');
    if (k === 'graph' && !s.graphDelay) return t('live.lat.measuring');
    const v = parts[k];
    if (v == null) return t('live.lat.unknown');
    const extra =
      k === 'graph' && s.graphDelay
        ? ` (${t('live.lat.graphSamples', { n: Math.max(s.graphDelay.dry, s.graphDelay.wet) })})`
        : '';
    return `${msText(v)} ms${extra}`;
  };

  const copyDiag = async () => {
    const text = formatDiagnostic({
      date: new Date().toISOString(),
      platform: s.platform,
      userAgent: navigator.userAgent,
      lowLatency: s.lowLatency,
      latencyHint: String(engine.latencyHint),
      input: isLive ? { label: inputLabel, channels: s.channelSel, channelCount: s.channelCount } : null,
      output: { label: outputLabel, nano: outputIsNano },
      rates,
      parts,
      graphDelaySamples: s.graphDelay ? { dry: s.graphDelay.dry, wet: s.graphDelay.wet } : null,
      limiter: engine.graph.limiterKind,
      glitches,
    });
    try {
      await navigator.clipboard.writeText(text);
      setMsg(t('live.copiedDiag'));
    } catch (err) {
      setMsg(t('live.copyFailed', { detail: String(err) }));
    }
  };

  const logRow = () => {
    const b = s.platform.browser;
    if ((b !== 'chrome' && b !== 'edge') || total == null) {
      setMsg(t('live.logUnsupported'));
      return;
    }
    const row: MeasureRow = { browser: b, lowLatency: s.lowLatency, output: outputIsNano ? 'nano' : 'pc' };
    useMeasureStore.getState().update(rowKey(row), {
      totalMs: (total * 1000).toFixed(1),
      ...(glitches ? { crackle: glitches.events > 0 } : {}),
    });
    setMsg(
      t('live.logged', {
        row: `${s.platform.browserName} · ${t('diag.col.lowLatency')} ${t(row.lowLatency ? 'diag.val.on' : 'diag.val.off')} · ${t(row.output === 'nano' ? 'diag.val.nano' : 'diag.val.pc')}`,
      }),
    );
  };

  return (
    <div className="latency-panel">
      <label className="check small">
        <input
          type="checkbox"
          checked={s.lowLatency}
          onChange={(e) => void s.setLowLatency(e.target.checked)}
        />
        {t('live.lowLatency')}
      </label>
      <p className="muted small">{t('live.lowLatencyHint')}</p>

      {glitches && glitches.events > 0 && (
        <div className="notice notice-warn small" role="status">
          {t(s.lowLatency ? 'live.glitchWarn' : 'live.glitchWarnStd', {
            n: glitches.events,
            ms: glitches.durationMs.toFixed(0),
          })}
          {s.lowLatency && (
            <button className="secondary" onClick={() => void s.setLowLatency(false)}>
              {t('live.glitchOff')}
            </button>
          )}
        </div>
      )}

      {issues.length > 0 && (
        <div className="notice notice-warn small" role="status">
          <strong>{t('live.rateWarnTitle')}</strong>
          <ul>
            {issues.map((k) => (
              <li key={k}>
                {t(`live.rate.${k}` as MessageKey, {
                  hz: rates[k] ?? '?',
                  name: k === 'input' ? inputLabel : outputLabel || t('live.rateDefaultOut'),
                })}
              </li>
            ))}
          </ul>
          <p>{t('live.rateSteps')}</p>
        </div>
      )}

      <div className="latency-box">
        <div className="latency-total">
          <span>{t('live.latencyTotal')}</span>
          <strong>{msText(total)} ms</strong>
        </div>
        {missing.length > 0 && <p className="muted small">{t('live.latencyPartial')}</p>}
        <details>
          <summary className="small">{t('live.latencyDetails')}</summary>
          <table className="latency-table small">
            <tbody>
              {LATENCY_KEYS.map((k) => (
                <tr key={k} className={parts[k] == null ? 'muted' : ''}>
                  <th scope="row">{t(`live.lat.${k}` as MessageKey)}</th>
                  <td>{partValue(k)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!glitches && <p className="muted small">{t('live.glitchUnknown')}</p>}
          {engine.graph.limiterKind === 'clip' && <p className="warn small">{t('live.limiterFallback')}</p>}
          <p className="muted small">{t('live.latencyFloor')}</p>
        </details>
        <div className="row">
          <button className="secondary" onClick={() => void copyDiag()}>
            {t('live.copyDiag')}
          </button>
          <button className="secondary" onClick={logRow}>
            {t('live.logRow')}
          </button>
        </div>
        {msg && <p className="ok small">{msg}</p>}
      </div>

      {s.platform.os === 'windows' && (
        <details className="tips">
          <summary className="small">
            <strong>{t('live.tipsTitle')}</strong>
          </summary>
          <ul className="checklist small">
            {TIP_KEYS.map((k) => (
              <li key={k}>
                <label className="check">
                  <input type="checkbox" />
                  {t(`live.tip.${k}` as MessageKey)}
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
