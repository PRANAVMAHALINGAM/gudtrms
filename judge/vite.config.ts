// Judge view server (owner: Shruti). Serves the React app plus one read-only JSON endpoint,
// GET <base>api/snapshot[?code=4F7K].
//   - `npm run judge`: Vite dev server at http://127.0.0.1:5199/ (local dev).
//   - Docker: built once (`vite build`), then served by `vite preview` under JUDGE_BASE=/demo/.
//     Caddy puts that at https://<DOMAIN>/demo. The team chose to host it as an open link for the
//     hackathon demo (AGENTS.md section 8); it shows whichever case is live.

import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { snapshot } from './server/snapshot.ts';

const rootEnv = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const base = process.env.JUDGE_BASE || '/';
const host = process.env.JUDGE_HOST || '127.0.0.1';
// Vite only answers requests addressed to localhost or an IP unless the host is listed here.
const allowedHosts = process.env.DOMAIN ? [process.env.DOMAIN, `www.${process.env.DOMAIN}`] : [];

async function snapshotHandler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'read-only' }));
    return;
  }
  try {
    const code = new URL(req.url ?? '', 'http://localhost').searchParams.get('code')?.trim() || undefined;
    res.end(JSON.stringify(await snapshot(code)));
  } catch (err) {
    // Message only (e.g. "No DATABASE_URL"); never row contents.
    res.statusCode = 503;
    res.end(JSON.stringify({ error: (err as Error).message }));
  }
}

function snapshotApi(): Plugin {
  return {
    name: 'gudtrms-snapshot-api',
    configureServer: (server) => void server.middlewares.use(`${base}api/snapshot`, snapshotHandler),
    configurePreviewServer: (server) => void server.middlewares.use(`${base}api/snapshot`, snapshotHandler),
  };
}

export default defineConfig({
  base,
  plugins: [react(), snapshotApi()],
  server: {
    host,
    port: 5199,
    strictPort: true,
    allowedHosts,
    // The app imports the real mediator/advocate code from ../src.
    fs: { allow: ['..'] },
  },
  preview: { host, port: 5199, strictPort: true, allowedHosts },
});
