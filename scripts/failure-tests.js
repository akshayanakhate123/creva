// Failure-path tests. Runs the REAL front end (counter.html in jsdom) against the REAL /api handlers, with the
// Groq network call mocked so each failure can be forced. For every case it prints the label a user would see and
// checks that the app still works and the GlowSkin numbers are still the engine's.
// Supabase is pointed at a closed port for the whole run, so nothing is ever written to your database.
// Run: node scripts/failure-tests.js
process.env.SUPABASE_URL = 'http://127.0.0.1:9';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'not-a-real-key';
process.env.AI_TIMEOUT_MS = '300'; // makes the timeout case quick

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './jsdom-app.js';
import { resetSupabase } from '../lib/supabase.js';

resetSupabase();
const { default: aiHandler } = await import('../api/ai.js');
const { default: dataHandler } = await import('../api/data.js');
const { analyze } = await import('../lib/engine.js');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'counter.html'), 'utf8');
const top = html.slice(html.indexOf('const GLOW_MSG'), html.indexOf('const EVAL_PROMPTS'));
const { GLOW_MSG, GLOW_CON } = new Function(top + '\nreturn {GLOW_MSG,GLOW_CON};')();
const E = analyze(GLOW_MSG, GLOW_CON);

let groqMode = 'ok';
const realFetch = globalThis.fetch;
const validDeal = () => ({
  headline: 'The licence, not the fee, is the headline issue: the contract grants perpetual worldwide usage.',
  fair_low: E.low, fair_high: E.high, indicative: E.indicative, confidence: 'Medium', evidence_tier: 2, evidence_count: 12,
  drivers: E.lines.filter((l) => l.group !== 'finance').map((l) => ({ label: l.label, amount: l.amount, group: l.group })),
  risks: E.risks.map((r) => ({ key: r.key, name: r.title, severity: r.sev, consequence: 'Mocked consequence sentence for ' + r.title + '.' })),
  unknowns: ['Paid media duration is not specified.'], counter_amount: E.counter.max,
});
globalThis.fetch = async (url, opts = {}) => {
  if (!String(url).includes('api.groq.com')) return realFetch(url, opts); // supabase goes to the closed port and fails
  if (groqMode === '429') return new Response('{"error":{"message":"rate limit"}}', { status: 429, headers: { 'retry-after': '30' } });
  if (groqMode === '500') return new Response('boom', { status: 500 });
  if (groqMode === 'malformed') return Response.json({ choices: [{ message: { content: 'this is definitely not json {' } }] });
  if (groqMode === 'timeout') return new Promise((_, rej) => opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }));
  return Response.json({ model: 'openai/gpt-oss-20b', choices: [{ message: { content: JSON.stringify(validDeal()) } }], usage: {} });
};

let ip = 0;
const bridge = (url, opts = {}) => {
  const u = new URL(url, 'http://localhost:5173');
  const h = u.pathname === '/api/ai' ? aiHandler : u.pathname === '/api/data' ? dataHandler : null;
  if (!h) return Promise.reject(new TypeError('no route'));
  return new Promise((resolve, reject) => {
    if (opts.signal) opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
    h.fetch(new Request(u.href, { method: opts.method || 'GET', headers: { 'x-forwarded-for': '10.8.0.' + (++ip), ...(opts.headers || {}) }, body: opts.body })).then(resolve, reject);
  });
};

const CASES = [
  { name: 'Missing GROQ_API_KEY', key: false, expect: 'fallback', label: /live model is not configured/ },
  { name: 'Groq HTTP 429 (rate limit)', groq: '429', expect: 'fallback', label: /rate limit reached, try again in a minute/ },
  { name: 'Groq timeout', groq: 'timeout', expect: 'fallback', label: /live model took too long/ },
  { name: 'Groq returns malformed JSON', groq: 'malformed', expect: 'fallback', label: /live model gave an unusable answer/ },
  { name: 'Groq HTTP 500', groq: '500', expect: 'fallback', label: /live model gave an unusable answer/ },
  { name: 'Browser has no network', net: false, expect: 'fallback', label: /no connection to the server/ },
  { name: 'User presses Stop', groq: 'timeout', stop: true, expect: 'fallback', label: /stopped by you/ },
  { name: 'Supabase unreachable, model fine', groq: 'ok', expect: 'live', label: /Live model \(Groq, openai\/gpt-oss-20b\)/, profileNote: true },
];

let failed = false;
const rows = [];
for (const c of CASES) {
  if (c.key === false) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = 'mock-key-not-real';
  groqMode = c.groq || 'ok';
  const app = await createApp(c.net === false ? () => Promise.reject(new TypeError('Failed to fetch')) : bridge);
  let note = '';
  try {
    app.run("loadOffer('glow'); S.route='rate'; render(false);");
    const p = app.run('runAnalysis()');
    if (c.stop) { await new Promise((r) => setTimeout(r, 40)); app.run('S.ctrl && S.ctrl.abort()'); }
    await p;
    const mode = app.run('S.mode');
    const label = (app.window.document.querySelector('#main .status') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim();
    const numbers = app.run('S.A.indicative===70000&&S.A.low===62000&&S.A.high===70000&&S.A.counter.max===68000&&S.A.risks.length===4');
    const renders = app.text().length > 200;
    if (c.profileNote) { app.run("S.route='profile'; render(false);"); note = /Demo data \(database offline\)/.test(app.text()) ? ' | Profile shows "Demo data (database offline)"' : ' | Profile note MISSING'; }
    const ok = mode === c.expect && c.label.test(label) && numbers && renders && !(c.profileNote && /MISSING/.test(note));
    if (!ok) failed = true;
    rows.push([c.name, ok ? 'PASS' : 'FAIL', 'sees: "' + label.slice(0, 110) + '"' + note, 'engine numbers intact: ' + numbers]);
  } catch (e) {
    failed = true; rows.push([c.name, 'FAIL', 'threw: ' + String(e && e.message).slice(0, 100), '']);
  }
  app.close();
}
for (const r of rows) console.log(r[1] + '  ' + r[0] + '\n      ' + r[2] + (r[3] ? '\n      ' + r[3] : ''));
console.log('\n' + rows.filter((r) => r[1] === 'PASS').length + '/' + rows.length + ' failure paths behave correctly');
process.exit(failed ? 1 : 0);
