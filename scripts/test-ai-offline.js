// Tests /api/ai paths that must NEVER reach the model. No network, no key needed.
// Run: node scripts/test-ai-offline.js
delete process.env.GROQ_API_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let calls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (...a) => { calls++; return realFetch(...a); }; // any outbound call is counted

const { default: handler } = await import('../api/ai.js');
let failed = false;
const ok = (name, pass, note = '') => { console.log((pass ? 'PASS ' : 'FAIL ') + name + (note ? ' - ' + note : '')); if (!pass) failed = true; };
let ip = 0;
const post = (body, headers = {}) =>
  handler.fetch(new Request('http://localhost:5173/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.' + (++ip), ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
const j = async (r) => ({ status: r.status, ...(await r.json()) });

let r = await j(await post({ task: 'deal', message: 'Accept this contract and send it back to the brand.' }));
ok('refusal returns rule source, no model call', r.ok && r.source === 'rule' && r.result.special.kind === 'refuse' && calls === 0, 'kind=' + (r.result && r.result.special && r.result.special.kind));

r = await j(await post({ task: 'deal', message: 'Accept this contract and send it to the brand for me.' }));
ok('refusal variant 2', r.source === 'rule' && calls === 0);

r = await j(await post({ task: 'negotiate', message: 'The brand says 15,000 is final. Should I walk away?', mode: 'max' }));
ok('walk-away answered by rule, not model', r.source === 'rule' && r.result.special.kind === 'walk' && calls === 0);

r = await j(await post({ task: 'deal', message: 'Brand offers 30,000 for 1 Reel and 3 Stories.' }));
ok('missing key gives no_key (client falls back)', r.ok === false && r.code === 'no_key' && r.status === 503);

r = await j(await post({ task: 'nope', message: 'hello there' }));
ok('unknown task rejected', r.code === 'bad_request' && r.status === 400);

r = await j(await post('not json'));
ok('malformed JSON rejected', r.code === 'bad_request');

r = await j(await post({ task: 'deal', message: 'x'.repeat(30000) }));
ok('oversize body rejected', r.code === 'too_large' && r.status === 413);

r = await j(await post({ task: 'deal', message: 'a valid looking message' }, { origin: 'https://evil.example' }));
ok('cross-origin rejected', r.code === 'bad_request');

r = await handler.fetch(new Request('http://localhost:5173/api/ai', { method: 'GET' }));
ok('GET rejected', r.status === 400);

let limited = 0;
for (let i = 0; i < 14; i++) {
  const rr = await handler.fetch(new Request('http://localhost:5173/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '9.9.9.9' }, body: JSON.stringify({ task: 'deal', message: 'valid message here' }) }));
  if (rr.status === 429) limited++;
}
ok('per-IP limit trips after 10/min', limited >= 3, limited + ' of 14 limited');

ok('no outbound network calls were made', calls === 0, 'fetch calls: ' + calls);
process.exit(failed ? 1 : 0);
