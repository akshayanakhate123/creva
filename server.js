// Local dev server. Serves counter.html (wrapped into a full page) and mounts api/*.js the way Vercel does.
// API files use the Web-standard handler: export default { fetch(request) { return new Response(...) } }
// Binds to 127.0.0.1 only, so your keys in .env.local are never reachable from other devices on your network.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { wrap } from './lib/wrap.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);

// Minimal .env.local loader (no dependency). Real environment variables win over the file.
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || m[1] in process.env) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv(path.join(root, '.env.local'));

// Dev only: api files import from lib/, which Node caches. Only the api file itself is re-imported on change
// (lib/ files are cached by Node). Restart `npm run dev` after editing lib/ files.
function latestMtime() {
  let t = 0;
  for (const dir of ['api']) {
    for (const f of fs.readdirSync(path.join(root, dir))) t = Math.max(t, fs.statSync(path.join(root, dir, f)).mtimeMs);
  }
  return t;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 200_000) throw new Error('too_large');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function runApi(req, res, name) {
  const file = path.join(root, 'api', name + '.js');
  if (!/^[a-z0-9-]+$/.test(name) || !fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, code: 'not_found' }));
  }
  try {
    const mod = await import(pathToFileURL(file).href + '?t=' + latestMtime());
    const handler = mod.default;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress || '');
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const request = new Request('http://' + (req.headers.host || 'localhost') + req.url, {
      method: req.method,
      headers,
      body: hasBody ? await readBody(req) : undefined,
    });
    const response = await handler.fetch(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    // Never echo error details: they could contain request data.
    const code = e && e.message === 'too_large' ? 'too_large' : 'server_error';
    console.error('api/' + name + ' failed:', code);
    res.writeHead(code === 'too_large' ? 413 : 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, code }));
  }
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/' || url.pathname === '/index.html') {
      fs.readFile(path.join(root, 'counter.html'), 'utf8', (err, html) => {
        if (err) { res.writeHead(500); return res.end('Cannot read counter.html'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(wrap(html));
      });
      return;
    }
    if (url.pathname.startsWith('/api/')) return runApi(req, res, url.pathname.slice(5));
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  })
  .listen(PORT, '127.0.0.1', () => console.log('CreVa running at http://localhost:' + PORT));
