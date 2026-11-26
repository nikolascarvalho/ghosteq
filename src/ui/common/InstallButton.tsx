import { useState } from 'react';
import { useT } from '../../i18n';
import { usePwaStore } from '../../state/pwaStore';

/** Botão "Instalar app" (Chrome/Edge/Android) ou instruções no iPhone/iPad. */
export function InstallButton() {
  const { t } = useT();
  const { canInstall, installed, isIos, install } = usePwaStore();
  const [showIosHelp, setShowIosHelp] = useState(false);
  if (installed) return null;

  if (canInstall) {
    return (
      <button className="install" onClick={() => void install()}>
        ⤓ {t('pwa.install')}
      </button>
    );
  }
  if (isIos) {
    return (
      <span className="install-wrap">
        <button className="install secondary" onClick={() => setShowIosHelp((v) => !v)}>
          ⤓ {t('pwa.install')}
        </button>
        {showIosHelp && (
          <span className="ios-help" role="dialog">
            {t('pwa.iosHelp')}
          </span>
        )}
      </span>
    );
  }
  return null;
}
