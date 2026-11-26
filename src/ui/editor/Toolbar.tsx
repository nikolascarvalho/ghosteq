import { useT } from '../../i18n';
import { selectCanRedo, selectCanUndo, useCurveStore } from '../../state/curveStore';
import { DevicePicker } from './DevicePicker';

interface Props {
  onSelect: (id: string | null) => void;
}

export function Toolbar({ onSelect }: Props) {
  const { t } = useT();
  const canUndo = useCurveStore(selectCanUndo);
  const canRedo = useCurveStore(selectCanRedo);
  const parametric = useCurveStore((s) => s.curve.mode === 'parametric');
  const { undo, redo, reset, addBand } = useCurveStore.getState();

  return (
    <div className="toolbar">
      <DevicePicker />
      <div className="row">
        <button className="secondary" onClick={undo} disabled={!canUndo} title="Ctrl+Z">
          ↶ {t('editor.undo')}
        </button>
        <button className="secondary" onClick={redo} disabled={!canRedo} title="Ctrl+Shift+Z">
          ↷ {t('editor.redo')}
        </button>
        <button
          className="secondary"
          onClick={() => {
            reset();
            onSelect(null);
          }}
        >
          {t('editor.reset')}
        </button>
        {parametric && (
          <button
            onClick={() => {
              const id = addBand({ type: 'peak', freq: 1000, gainDb: 0, q: 1, enabled: true });
              if (id) onSelect(id);
            }}
          >
            {t('editor.addBand')}
          </button>
        )}
      </div>
    </div>
  );
}
