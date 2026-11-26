import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { useCurveStore } from '../../state/curveStore';
import { useIrStore } from '../../state/irStore';
import { OutputPanel } from '../export/OutputPanel';
import { PresetsPanel } from '../presets/PresetsPanel';
import { BandPanel } from './BandPanel';
import { DeviationNotice } from './DeviationNotice';
import { EqGraph } from './EqGraph';
import { Toolbar } from './Toolbar';

/** Ctrl/Cmd+Z desfaz; Ctrl/Cmd+Shift+Z ou Ctrl+Y refaz (fora de campos de texto). */
function useUndoShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range'))
      )
        return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        useCurveStore.getState().undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        useCurveStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function EditorPage() {
  const { t } = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const bands = useCurveStore((s) => s.curve.bands);
  const length = useIrStore((s) => s.result?.length);
  useUndoShortcuts();

  // Se a banda selecionada sumir (desfazer, reset, preset), limpa a seleção.
  const selectedId = selected && bands.some((b) => b.id === selected) ? selected : null;

  return (
    <main className="page editor">
      <Toolbar onSelect={setSelected} />

      <section className="card graph-card">
        <EqGraph selectedId={selectedId} onSelect={setSelected} />
        <div className="legend small">
          <span className="lg lg-target">{t('editor.legendTarget')}</span>
          <span className="lg lg-real">{t('editor.legendReal', { n: length ?? '…' })}</span>
          <span className="lg lg-dev">{t('editor.legendDeviation')}</span>
        </div>
        <p className="muted small">{t('editor.graphHint')}</p>
      </section>

      <DeviationNotice />

      <div className="editor-columns">
        <BandPanel bandId={selectedId} onSelect={setSelected} />
        <OutputPanel />
      </div>

      <PresetsPanel />
    </main>
  );
}
