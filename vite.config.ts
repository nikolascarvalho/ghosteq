/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// HTTPS no dev server: o navegador só libera microfone/getUserMedia e
// service worker em "contexto seguro" (https ou localhost). Para testar
// pelo celular na rede local (https://192.168.x.x:5173) precisamos de HTTPS.
// GHOSTEQ_HTTP=1 desliga o HTTPS (útil só em localhost, que já é seguro).
const useHttps = process.env.GHOSTEQ_HTTP !== '1';

const THEME = '#0f1115';

export default defineConfig({
  plugins: [
    react(),
    ...(useHttps ? [basicSsl()] : []),
    // PWA: manifest (nome, ícones, cor) + service worker que guarda o app no
    // aparelho para funcionar OFFLINE. Analogia: um cache local de todos os
    // artefatos do build, versionado — cada deploy gera uma nova versão.
    VitePWA({
      // 'prompt': a versão nova só entra quando o usuário clicar em "Atualizar"
      // (recarregar sozinho no meio de uma sessão de áudio seria ruim).
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'GhostEQ — O EQ que não ocupa slot',
        short_name: 'GhostEQ',
        description:
          'Gera IRs (WAV) com curva de EQ para o bloco de IR do seu modeler (Nano Cortex, Quad Cortex, Helix). Tudo no navegador.',
        lang: 'pt-BR',
        theme_color: THEME,
        background_color: THEME,
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['music', 'utilities'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Tudo que o app precisa para abrir offline (inclui worker de DSP e worklet).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // Rotas do app (ex.: /diagnostico) abrem offline com o index.html.
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Loops de exemplo (WAVs grandes) não entram no pacote de instalação:
        // são guardados na primeira vez que tocam.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/samples/') && url.pathname.endsWith('.wav'),
            handler: 'CacheFirst',
            options: { cacheName: 'ghosteq-samples', expiration: { maxEntries: 10 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    // AudioWorklets precisam ser arquivos de verdade, não "data:" embutido.
    assetsInlineLimit: (file) => (file.endsWith('.worklet.js') ? false : undefined),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
