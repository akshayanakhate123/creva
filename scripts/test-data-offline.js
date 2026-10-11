// Tests /api/data validation and failure paths with NO database and no network. Run: node scripts/test-data-offline.js
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { default: handler } = await import('../api/data.js');
const { validateProfile, validateContract, validateEval, validateEvent, toDbContractId, fromDbContractId } = await import('../lib/data.js');
let failed = false;
const ok = (name, pass, note = '') => { console.log((pass ? 'PASS ' : 'FAIL ') + name + (note ? ' - ' + note : '')); if (!pass) failed = true; };

let ip = 0;
const call = async (method, kind, body, headers = {}) => {
  const r = await handler.fetch(new Request('http://localhost:5173/api/data?kind=' + kind, { method, headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.1.0.' + (++ip), ...headers }, body: body == null ? undefined : JSON.stringify(body) }));
  return { status: r.status, ...(await r.json()) };
};

let r = await call('GET', 'bootstrap');
ok('no env vars gives 503 db_not_configured (front end uses seeded data)', r.status === 503 && r.code === 'db_not_configured');
r = await call('GET', 'bootstrap', null, { origin: 'https://evil.example' });
ok('cross-origin rejected', r.code === 'bad_request');
// On Vercel the function sees an http:// URL while the browser's Origin is https:// for the same site. That must be allowed.
r = await call('GET', 'bootstrap', null, { origin: 'https://creva.example', host: 'creva.example' });
ok('same site over https behind a proxy is allowed (the live photo-save bug)', r.code === 'db_not_configured', r.code);
r = await call('GET', 'bootstrap', null, { origin: 'https://evil.example', host: 'creva.example' });
ok('another site is still rejected behind a proxy', r.code === 'bad_request');
r = await call('GET', 'bootstrap', null, { origin: 'https://evil.example', 'x-forwarded-host': 'creva.example' });
ok('another site is rejected when the forwarded host is ours', r.code === 'bad_request');

const good = { name: 'Ananya Sharma', email: 'a@b.co', topics: ['Careers'], languages: ['English'], social: [{ id: 'ig', active: true, handle: 'ananyasharma', followers: 54000 }, { id: 'li', active: true, handle: 'ananya-sharma', followers: 18000 }, { id: 'zz', active: true, handle: 'x' }] };
let v = validateProfile(good);
ok('profile validates and maps ig/li columns', v.value && v.value.instagram_followers === 54000 && v.value.linkedin_handle === 'ananya-sharma');
ok('unknown social platform dropped', v.value.social.length === 2);
ok('profile without a name rejected', validateProfile({ ...good, name: '  ' }).error === 'bad_request');
ok('bad email rejected', validateProfile({ ...good, email: 'not-an-email' }).error === 'bad_request');
v = validateProfile({ ...good, bio: 'x'.repeat(5000), topics: Array(100).fill('t') });
ok('long text and long lists are capped', v.value.bio.length === 300 && v.value.topics.length === 20);
v = validateProfile({ ...good, hacker: 'DROP TABLE profiles', id: 'someone-else' });
ok('unknown keys dropped and id forced to the demo user', v.value.id === 'demo-ananya' && !('hacker' in v.value));
ok('handle with spaces/quotes is blanked', validateProfile({ ...good, social: [{ id: 'ig', active: true, handle: "a b'; --" }] }).value.instagram_handle === null);

let c = validateContract({ id: 'glow', brand: 'GlowSkin', body: 'some contract text', issueStates: { perpetual: 'reviewed', bogus: 'cleared', payment: 'hacked' } });
ok('contract validates, id mapped, only valid issue states kept', c.value && c.value.id === 'ctr-glowskin' && JSON.stringify(c.value.issue_states) === '{"perpetual":"reviewed"}');
ok('contract id mapping round-trips', fromDbContractId(toDbContractId('ledgerly')) === 'ledgerly' && fromDbContractId('ctr-glowskin') === 'glow');
ok('contract with bad id rejected', validateContract({ id: 'a b', brand: 'X', body: 'text' }).error === 'bad_request');
ok('oversize contract rejected', validateContract({ id: 'x', brand: 'X', body: 'a'.repeat(40000) }).error === 'too_large');
ok('eval needs a boolean passed', validateEval({ prompt: 'p', passed: 'yes' }).error === 'bad_request' && validateEval({ prompt: 'p', passed: true }).value.passed === true);
const ev = validateEvent({ event: 'fallback', task: 'deal', reason: 'rate_limited', brand: 'GlowSkin' });
ok('fallback event validates and is stored as a fallback analysis', ev.value && ev.value.source === 'fallback' && ev.value.result._task === 'deal' && ev.value.result._reason === 'rate_limited');
ok('event with an unknown task or event type is rejected', validateEvent({ event: 'fallback', task: 'drop' }).error === 'bad_request' && validateEvent({ event: 'other', task: 'deal' }).error === 'bad_request');
const c2 = validateContract({ id: 'x', brand: 'X', body: 'some contract text', issueStates: { indemnity: 'reviewed', liability: 'cleared', tax: 'dismissed' } });
ok('new issue keys (indemnity, liability, tax) can be saved', JSON.stringify(c2.value.issue_states) === JSON.stringify({ indemnity: 'reviewed', liability: 'cleared', tax: 'dismissed' }));
process.exit(failed ? 1 : 0);
