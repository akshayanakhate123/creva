// Real-database check of the server-side plan rules. Sets the plan to Free, confirms locked tasks are refused before any model call
// (so no Groq quota is used), then puts the plan back. Start the server first (npm run dev). Prints no secrets.
const BASE = process.env.BASE || 'http://localhost:5173';
const get = async (k) => (await fetch(BASE + '/api/data?kind=' + k)).json();
const post = async (u, body) => { const r = await fetch(BASE + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json()) }; };
let failed = false;
const ok = (name, pass, note = '') => { console.log((pass ? 'PASS ' : 'FAIL ') + name + (note ? ' - ' + note : '')); if (!pass) failed = true; };

const before = (await get('bootstrap')).profile;
const setPlan = (plan) => post('/api/data?kind=profile', { ...before, preferences: { ...before.preferences, plan } });
try {
  ok('switched the plan to Free', (await setPlan('Free')).ok === true);
  const c = await post('/api/ai', { task: 'contract', brand: 'GlowSkin', message: 'Please review this contract.', contract: 'Usage is perpetual. The creator indemnifies the brand.' });
  ok('contract review is refused on Free, before any model call', c.ok === false && c.code === 'plan_locked', c.code || '');
  const a = await post('/api/ai', { task: 'autopsy', brand: 'GlowSkin', message: 'How did my post do?', context: { metrics: { reach: 40, ret3: 30, saves: 3, shares: 1 }, post: 'Resume tips Reel', window: '48 hours' } });
  ok('Post Autopsy is refused on Free', a.ok === false && a.code === 'plan_locked', a.code || '');
  const u = (await get('bootstrap')).usage.dealAnalyses;
  if (u >= 2) {
    const d = await post('/api/ai', { task: 'deal', brand: 'GlowSkin', message: 'GlowSkin offers Rs 30,000 for one Reel.', contract: '' });
    ok('a third deal analysis in the month is refused on Free', d.ok === false && d.code === 'plan_limit', d.code || '');
  } else console.log('SKIP deal limit: only ' + u + ' deal analyses this month, a check would spend a live model call');
} finally {
  const back = await setPlan(before.preferences.plan || 'Pro');
  ok('plan restored', back.ok === true);
  const now = (await get('bootstrap')).profile;
  ok('restored plan matches', now.preferences.plan === before.preferences.plan);
}
process.exit(failed ? 1 : 0);
