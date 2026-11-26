// Serve a pasta dist/ (build de produção) em HTTP puro, só em localhost:4174.
// Uso: npm run build && npm run preview:http
// Útil para testar o service worker/PWA sem o aviso de certificado.
import { preview } from 'vite';

process.env.GHOSTEQ_HTTP = '1';
const server = await preview({ preview: { port: 4174, host: 'localhost' } });
server.printUrls();
