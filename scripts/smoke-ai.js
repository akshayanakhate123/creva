// Calls the running local server's /api/ai with the GlowSkin scenario and prints what came back.
// Start the server first (npm run dev). Prints no secrets. Makes ONE live model call (counts toward your free quota).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'counter.html'), 'utf8');
const top = html.slice(html.indexOf('const GLOW_MSG'), html.indexOf('const EVAL_PROMPTS'));
const { GLOW_MSG, GLOW_CON } = new Function(top + '\nreturn {GLOW_MSG,GLOW_CON};')();
const BASE = process.env.BASE || 'http://localhost:5173';

const t0 = Date.now();
const res = await fetch(BASE + '/api/ai', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    task: 'deal', brand: 'GlowSkin', message: GLOW_MSG, contract: GLOW_CON,
    context: { profileName: 'Ananya Sharma', city: 'Bengaluru', niche: 'Career and productivity', instagramFollowers: 54000, linkedinFollowers: 18000, closedDeals: [42000, 51000, 57000], networkCount: 12, networkMedian: 54000, opportunityId: 'opp-glowskin' },
  }),
});
const data = await res.json();
console.log('HTTP', res.status, '| ok:', data.ok, '| source:', data.source || '-', '| model:', data.model || '-', '| round trip ms:', Date.now() - t0, '| server ms:', data.latency_ms ?? '-');
if (!data.ok) { console.log('code:', data.code, '|', data.message, data.retry_after ? '| retry after s: ' + data.retry_after : ''); process.exit(1); }
const r = data.result;
console.log('fair range:', r.fair_low, 'to', r.fair_high, '| indicative:', r.indicative, '| counter:', r.counter_amount);
console.log('confidence:', r.confidence, '| tier:', r.evidence_tier, '| deals:', r.evidence_count, '| numbers_adjusted:', r.numbers_adjusted);
console.log('risks:', r.risks.length, r.risks.map((x) => x.severity + ' ' + x.name).join(' | '));
console.log('headline:', r.headline);
const pass = r.fair_low === 62000 && r.fair_high === 70000 && r.indicative === 70000 && r.counter_amount === 68000 && r.risks.length === 4;
console.log(pass ? 'GlowSkin numbers OK' : 'GlowSkin numbers MISMATCH');
process.exit(pass ? 0 : 1);
