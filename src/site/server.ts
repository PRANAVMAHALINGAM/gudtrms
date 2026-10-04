// Landing page server (owner: Pranav). Serves site/ and one endpoint, POST /api/signup, which
// adds the person as a Photon project user and returns the gudtrms line they should text.
// Unlike the judge view this is meant to be hosted: it reads no case data and never touches Neon.
//
//   npm run site            http://127.0.0.1:5200
//   HOST=0.0.0.0 PORT=8080  when hosting (and TRUST_PROXY=1 behind a proxy, for the rate limit)

import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSharedUser, PhotonError } from './photon.ts';
import { parseSignup } from './signup.ts';

const ROOT = fileURLToPath(new URL('../../site/', import.meta.url));
const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 5200);
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

// Only these files are served, so no path can reach outside site/.
const FILES: Record<string, string> = {
  '/': 'index.html',
  '/styles.css': 'styles.css',
  '/app.js': 'app.js',
  '/favicon.svg': 'favicon.svg',
  '/favicon.ico': 'favicon.svg',
};
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

// Each sign-up creates a real Photon user (and the shared pool has a cap), so limit it per IP.
const LIMIT = 5;
const WINDOW_MS = 10 * 60_000;
const recent = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= LIMIT) return true;
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 10_000) recent.clear();
  return false;
}

function clientIp(req: IncomingMessage): string {
  // Cloudflare tunnel: Cloudflare sets this itself, while X-Forwarded-For keeps whatever the client sent.
  const cloudflare = req.headers['cf-connecting-ip'];
  if (TRUST_PROXY && typeof cloudflare === 'string') return cloudflare;
  const forwarded = req.headers['x-forwarded-for'];
  if (TRUST_PROXY && typeof forwarded === 'string') return forwarded.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? 'unknown';
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > 4096) throw new Error('too big');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function signup(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return json(res, 400, { error: 'Something went wrong sending the form. Try again?' });
  }
  // Honeypot: a hidden field people never see, so anything in it came from a bot.
  if (body && typeof body === 'object' && (body as Record<string, unknown>).website) {
    return json(res, 400, { error: 'Something went wrong. Try again?' });
  }
  const parsed = parseSignup(body);
  if (!parsed.ok) return json(res, 422, { field: parsed.field, error: parsed.message });
  if (rateLimited(clientIp(req))) {
    return json(res, 429, { error: 'Too many sign-ups from here. Give it a few minutes.' });
  }

  try {
    const user = await createSharedUser(parsed.user);
    json(res, 200, { firstName: user.firstName ?? parsed.user.firstName, line: user.assignedPhoneNumber });
  } catch (err) {
    // Status and Photon's message only, never the form contents.
    const status = err instanceof PhotonError ? err.status : 0;
    console.error(`[site] Photon sign-up failed (${status}): ${(err as Error).message}`);
    if (status === 422) {
      return json(res, 422, { field: 'phone', error: 'Our texting line couldn’t take that number. Is it an iPhone on iMessage?' });
    }
    json(res, 503, { error: 'We couldn’t set up your line just now. Try again in a minute.' });
  }
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path === '/api/signup') {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
    return signup(req, res);
  }
  const file = FILES[path];
  if (!file || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    return res.end('Not found');
  }
  try {
    const data = await readFile(join(ROOT, file));
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(500, SECURITY_HEADERS);
    res.end();
  }
});

server.listen(PORT, HOST, () => console.log(`[site] gudtrms landing page on http://${HOST}:${PORT}`));
