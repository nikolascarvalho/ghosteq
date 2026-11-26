import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getLang } from './i18n';
import { useCabStore } from './state/cabStore';
import { startIrSync } from './state/irStore';
import { startPwa } from './state/pwaStore';
import './ui/styles.css';

document.documentElement.lang = getLang();
// Liga curva → worker de DSP → IR calculado (roda em segundo plano o tempo todo).
startIrSync();
// Recarrega o IR de caixa salvo da última sessão (se houver).
void useCabStore.getState().hydrate();
// PWA: service worker (offline + aviso de nova versão) e botão "Instalar app".
startPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
