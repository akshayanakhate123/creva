// Consistency audit: the GlowSkin numbers must be identical on every screen that shows them.
// Renders the REAL screens from counter.html in jsdom (engine only, no network) and checks each one.
// Run: node scripts/audit-consistency.js   (exits 1 on any mismatch)
import { createApp } from './jsdom-app.js';

const app = await createApp();
const TRUTH = { indicative: '₹70,000', low: '₹62,000', high: '₹70,000', counter: '₹68,000', closed: '₹58,000', content: '₹47,000', rights: '₹25,000', offer: '₹30,000', issues: 4 };
const WRONG = ['₹67,000', '₹65,000', '₹59,000', '₹66,000', '₹72,000', '₹89,000', '₹63,000', '₹61,000'];

// state the way a user would get there with the GlowSkin offer loaded and analysed by the engine
app.run("loadOffer('glow'); S.A=analyze(S.msg,S.con); S.mode=''; S.cMode='max'; setDraft(); S.tour=null;");
const screens = {
  Home: () => app.run("S.route='home'"),
  Opportunities: () => app.run("S.route='opps'"),
  'Deal Intelligence': () => app.run("S.route='rate'"),
  Breakdown: () => app.run("S.route='breakdown'"),
  Contracts: () => app.run("S.cid='glow'; S.route='contracts'"),
  Negotiate: () => app.run("S.route='negotiate'"),
  Deals: () => app.run("S.dealTab='active'; S.dealId='glow'; S.route='deals'"),
};
const CHECKS = {
  Home: [['offer ₹30,000', (t) => t.includes(TRUTH.offer)], ['indicative ₹70K (donut)', (t) => t.includes('₹70K')], ['range ₹62,000 to ₹70,000', (t) => t.includes(TRUTH.low + ' to ' + TRUTH.high)], ['4 contract risks', (t) => /4 contract risks/.test(t)], ['57% below indicative', (t) => /57% below/.test(t)]],
  Opportunities: [['offer ₹30,000', (t) => t.includes(TRUTH.offer)], ['GlowSkin severity High', (t) => /GlowSkin\s*High/.test(t)]],
  'Deal Intelligence': [['range ₹62,000 – ₹70,000', (t) => t.includes(TRUTH.low + ' – ' + TRUTH.high)], ['indicative ₹70,000', (t) => t.includes('Indicative value ' + TRUTH.indicative)], ['confidence Medium', (t) => /Confidence\s*Medium/.test(t)], ['Tier 2 · 12 deals', (t) => /Tier 2\s*·\s*12 deals/.test(t)], ['4 risks listed', () => app.count('.rrow') >= 4 && app.run('S.A.risks.length') === TRUTH.issues]],
  Breakdown: [['title ₹70,000', (t) => t.includes('How CreVa got to ' + TRUTH.indicative)], ['content ₹47,000', (t) => t.includes(TRUTH.content)], ['rights ₹25,000', (t) => t.includes(TRUTH.rights)], ['range 62,000 to 70,000', (t) => /62,000 to 70,000/.test(t)], ['their offer ₹30,000', (t) => t.includes(TRUTH.offer)]],
  Contracts: [['4 issues to review', (t) => /of 4 to review/.test(t) || /4\s*of 4/.test(t)], ['4 issue cards', () => app.count('.issue') === TRUTH.issues], ['brand GlowSkin', (t) => t.includes('Contract withGlowSkin') || /Contract with\s*GlowSkin/.test(t)]],
  Negotiate: [['maximize ₹68,000', (t) => t.includes(TRUTH.counter)], ['protect relationship ₹55,000', (t) => t.includes('₹55,000')], ['preserve budget ₹32,000', (t) => t.includes('₹32,000')], ['draft states ₹68,000', () => /68,000/.test(app.run('S.draft'))], ['confidence MEDIUM, 12 deals', (t) => /MEDIUM, based on 12 comparable deals/.test(t)]],
  Deals: [['opening ₹30,000', (t) => t.includes(TRUTH.offer)], ['counter ₹68,000', (t) => t.includes(TRUTH.counter)], ['closed ₹58,000', (t) => t.includes(TRUTH.closed)], ['+₹28,000 (+93%)', (t) => t.includes('+₹28,000 vs opening offer (+93%)')], ['range ₹62,000 to ₹70,000', (t) => t.includes(TRUTH.low + ' to ' + TRUTH.high)]],
};

const rows = [];
let failed = false;
for (const [name, go] of Object.entries(screens)) {
  go();
  app.run('S._static=true; render(false); S._static=false;'); // static render: no count-up animation mid-read
  const t = app.text();
  for (const [label, fn] of CHECKS[name]) { const ok = !!fn(t); rows.push([name, label, ok ? 'PASS' : 'FAIL']); if (!ok) failed = true; }
  const drift = WRONG.filter((w) => t.includes(w));
  rows.push([name, 'no drifted GlowSkin numbers', drift.length ? 'FAIL (' + drift.join(', ') + ')' : 'PASS']);
  if (drift.length) failed = true;
}
const w1 = Math.max(...rows.map((r) => r[0].length)), w2 = Math.max(...rows.map((r) => r[1].length));
for (const r of rows) console.log(r[0].padEnd(w1) + '  ' + r[1].padEnd(w2) + '  ' + r[2]);
console.log('\n' + rows.filter((r) => r[2] === 'PASS').length + '/' + rows.length + ' checks passed');
app.close();
process.exit(failed ? 1 : 0);
