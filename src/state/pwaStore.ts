// PWA: instalação e atualização do app.
// - "Instalar app": o Chrome/Edge/Android disparam o evento beforeinstallprompt
//   quando o app é instalável; guardamos o evento e mostramos nosso botão.
//   O iOS (Safari) não tem esse evento: lá a instalação é manual
//   (Compartilhar → Adicionar à Tela de Início), então mostramos instruções.
// - Atualização: quando sai um deploy novo, o service worker avisa e o
//   usuário escolhe quando recarregar (nunca no meio de uma sessão de áudio).
import { create } from 'zustand';
import { registerSW } from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  canInstall: boolean;
  installed: boolean;
  isIos: boolean;
  needRefresh: boolean;
  offlineReady: boolean;
  install: () => Promise<void>;
  update: () => void;
  dismiss: () => void;
}

let deferred: BeforeInstallPromptEvent | null = null;
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;

const standalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

const ios = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1));

export const usePwaStore = create<PwaState>()((set) => ({
  canInstall: false,
  installed: standalone(),
  isIos: ios(),
  needRefresh: false,
  offlineReady: false,

  install: async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    set({ canInstall: false, installed: outcome === 'accepted' });
  },

  update: () => {
    void updateSW?.(true);
  },

  dismiss: () => set({ needRefresh: false, offlineReady: false }),
}));

/** Chamado uma vez em main.tsx. */
export function startPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // não mostra o mini-banner do navegador; usamos nosso botão
    deferred = e as BeforeInstallPromptEvent;
    usePwaStore.setState({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    usePwaStore.setState({ canInstall: false, installed: true });
  });
  updateSW = registerSW({
    onNeedRefresh: () => usePwaStore.setState({ needRefresh: true }),
    onOfflineReady: () => usePwaStore.setState({ offlineReady: true }),
  });
}
