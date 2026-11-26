import { useT } from '../../i18n';
import { usePwaStore } from '../../state/pwaStore';

/** Avisos do service worker: "nova versão disponível" e "pronto para offline". */
export function PwaToast() {
  const { t } = useT();
  const { needRefresh, offlineReady, update, dismiss } = usePwaStore();
  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="toast" role="status">
      <span>{needRefresh ? t('pwa.needRefresh') : t('pwa.offlineReady')}</span>
      {needRefresh && <button onClick={update}>{t('pwa.update')}</button>}
      <button className="secondary" onClick={dismiss}>
        {t('pwa.dismiss')}
      </button>
    </div>
  );
}
