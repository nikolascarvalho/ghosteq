// Gera os ícones PNG do app (favicon, Android, iOS, "maskable") a partir de
// public/icon.svg. Rode `npm run icons` depois de mudar o SVG.
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#0f1115' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#0f1115' } },
  },
  images: ['public/icon.svg'],
});
