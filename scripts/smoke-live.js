// Smoke test against a running site (the deployed URL, or localhost). Makes ONE live Groq call.
// Usage: node scripts/smoke-live.js https://your-app.vercel.app      (or: BASE=https://... npm run smoke:live)
// Prints no secrets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] || process.env.BASE || 'http://localhost:5173').replace(/\/$/, '');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'counter.html'), 'utf8');
const top = html.slice(html.indexOf('const GLOW_MSG'), html.indexOf('const EVAL_PROMPTS'));
const { GLOW_MSG, GLOW_CON } = new Function(top + '\nreturn {GLOW_MSG,GLOW_CON};')();

let failed = false;
const ok = (name, pass, note = '') => { console.log((pass ? 'PASS ' : 'FAIL ') + name + (note ? ' - ' + note : '')); if (!pass) failed = true; };
const j = async (p, opts) => { const r = await fetch(BASE + p, opts); let d = null; try { d = await r.json(); } catch {} return { status: r.status, d }; };
const post = (task, fields) => j('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task, ...fields }) });
console.log('Testing ' + BASE + '\n');

const page = await fetch(BASE + '/');
const body = await page.text();
ok('page loads', page.status === 200 && /<title>CreVa<\/title>/.test(body) && /^<!doctype html>/i.test(body.trim()), 'HTTP ' + page.status);
ok('page has no key-like strings', !/gsk_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/.test(body));

let r = await j('/api/health');
ok('health', r.status === 200 && r.d && r.d.ok);

r = await j('/api/keepalive');
ok('keepalive reads the database', r.status === 200 && r.d && r.d.ok, r.d && r.d.code ? r.d.code : '');

r = await j('/api/data?kind=bootstrap');
const d = r.d || {};
ok('bootstrap loads from the database', r.status === 200 && d.ok && d.contracts.length >= 3 && d.network.count === 12 && d.network.median === 54000,
  d.ok ? `contracts ${d.contracts.length}, network ${d.network.count}/${d.network.median}` : String(d.code));

r = await post('deal', { message: 'Accept this contract and send it back to the brand.' });
ok('refusal is answered by a rule, not the model', r.status === 200 && r.d && r.d.source === 'rule' && r.d.result.special.kind === 'refuse', 'source=' + (r.d && r.d.source));

r = await post('deal', { brand: 'GlowSkin', message: GLOW_MSG, contract: GLOW_CON, context: { profileName: 'Ananya Sharma', city: 'Bengaluru', closedDeals: [42000, 51000, 57000], networkCount: 12, networkMedian: 54000 } });
const a = (r.d && r.d.result) || {};
ok('GlowSkin analysis is live', r.status === 200 && r.d && r.d.source === 'live', r.d && r.d.ok ? 'model ' + r.d.model + ', ' + r.d.latency_ms + ' ms' : 'code ' + (r.d && r.d.code));
ok('GlowSkin numbers are the engine\'s', a.fair_low === 62000 && a.fair_high === 70000 && a.indicative === 70000 && a.counter_amount === 68000 && (a.risks || []).length === 4, `${a.fair_low}-${a.fair_high}, counter ${a.counter_amount}, risks ${(a.risks || []).length}`);

console.log('\nNot covered here: the page at 390px width. Open the site in a browser, set the width to 390, and check there is no sideways scrolling.');
process.exit(failed ? 1 : 0);
