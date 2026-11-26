import { useT } from '../../i18n';
import { useAudioStore } from '../../state/audioStore';

/**
 * Botão de pânico: fixo no canto da tela enquanto o áudio estiver ligado
 * (sempre visível, mesmo rolando a página). Mudo instantâneo + para a fonte.
 * Atalho: Esc.
 */
export function PanicButton() {
  const { t } = useT();
  const on = useAudioStore((s) => s.on);
  const muted = useAudioStore((s) => s.muted);
  const { panic, setMuted } = useAudioStore.getState();
  if (!on) return null;
  return (
    <div className="panic-wrap">
      {muted ? (
        <button className="panic unmute" onClick={() => setMuted(false)}>
          🔈 {t('live.unmute')}
        </button>
      ) : (
        <button className="panic" onClick={panic} title="Esc">
          ⛔ {t('live.panic')}
        </button>
      )}
    </div>
  );
}
