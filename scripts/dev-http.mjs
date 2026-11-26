// Sobe o dev server em HTTP puro na porta 5174, só para localhost.
// Uso: npm run dev:http  (o padrão continua sendo `npm run dev` com HTTPS).
import { createServer } from 'vite';

process.env.GHOSTEQ_HTTP = '1';
const server = await createServer({ server: { port: 5174, host: 'localhost' } });
await server.listen();
server.printUrls();
