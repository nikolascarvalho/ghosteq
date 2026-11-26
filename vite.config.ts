/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS no dev server: o navegador só libera microfone/getUserMedia e
// service worker em "contexto seguro" (https ou localhost). Para testar
// pelo celular na rede local (https://192.168.x.x:5173) precisamos de HTTPS.
// GHOSTEQ_HTTP=1 desliga o HTTPS (útil só em localhost, que já é seguro).
const useHttps = process.env.GHOSTEQ_HTTP !== '1';

export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
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
