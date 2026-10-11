// Proves the profile photo and plan survive a reload against the real database, then puts the profile back exactly as it was.
// Start the server first (npm run dev). Prints no secrets.
const BASE = process.env.BASE || 'http://localhost:5173';
const get = async (k) => (await fetch(BASE + '/api/data?kind=' + k)).json();
const post = async (k, body) => { const r = await fetch(BASE + '/api/data?kind=' + k, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json()) }; };
let failed = false;
const ok = (name, pass, note = '') => { console.log((pass ? 'PASS ' : 'FAIL ') + name + (note ? ' - ' + note : '')); if (!pass) failed = true; };

const before = (await get('bootstrap')).profile;
ok('read the saved profile', !!before);
const photo = 'data:image/jpeg;base64,' + Buffer.from('creva-persist-test-'.repeat(40)).toString('base64');
try {
  const saved = await post('profile', { ...before, preferences: { ...before.preferences, avatar: photo, avatarSeed: 777, plan: 'Founding' } });
  ok('saving a profile with a photo succeeds', saved.ok === true, saved.code || '');
  const after = (await get('bootstrap')).profile;
  ok('after a fresh read the photo comes back unchanged', after.preferences.avatar === photo);
  ok('the avatar seed and plan come back too', after.preferences.avatarSeed === 777 && after.preferences.plan === 'Founding');
  const tooBig = await post('profile', { ...before, preferences: { ...before.preferences, avatar: 'data:image/jpeg;base64,' + 'A'.repeat(200000) } });
  ok('an oversize photo is refused', tooBig.ok === false, tooBig.code || '');
  const notImg = await post('profile', { ...before, preferences: { ...before.preferences, avatar: 'javascript:alert(1)' } });
  const stored = (await get('bootstrap')).profile.preferences.avatar || '';
  ok('a non-image value is never stored', !/javascript:/.test(stored), notImg.ok ? 'dropped on save' : notImg.code);
} finally {
  const back = await post('profile', before);
  ok('profile restored to what it was', back.ok === true);
  const now = (await get('bootstrap')).profile;
  ok('restored photo and plan match the original', (now.preferences.avatar || '') === (before.preferences.avatar || '') && now.preferences.plan === before.preferences.plan);
}
process.exit(failed ? 1 : 0);
