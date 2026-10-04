// Judge view dev server (owner: Shruti). localhost ONLY: never deploy this (AGENTS.md section 8).
// Serves the React app plus one read-only JSON endpoint, GET /api/snapshot[?code=4F7K].

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { snapshot } from './server/snapshot.ts';

const rootEnv = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

function snapshotApi(): Plugin {
  return {
    name: 'gudtrms-snapshot-api',
    configureServer(server) {
      server.middlewares.use('/api/snapshot', async (req, res) => {
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
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), snapshotApi()],
  server: {
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
    // The app imports the real mediator/advocate code from ../src.
    fs: { allow: ['..'] },
  },
});
