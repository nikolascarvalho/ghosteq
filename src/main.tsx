import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getLang } from './i18n';
import { startIrSync } from './state/irStore';
import './ui/styles.css';

document.documentElement.lang = getLang();
// Liga curva → worker de DSP → IR calculado (roda em segundo plano o tempo todo).
startIrSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
