// Offline tests for the guardrails the product spec promises: escalation, confidence caps, lockout pricing,
// correlation-not-cause, and the "uncited figure" verifier. No network, no keys. Run: node scripts/test-engine.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, special, checkRate, parseAmount, INR } from '../lib/engine.js';
import { figuresIn, allowedFigures, uncited, reconcileDeal, reconcileContract, validateDraft, validateAutopsy } from '../lib/validate.js';
import { missingTerms } from '../lib/engine.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'counter.html'), 'utf8');
const top = html.slice(html.indexOf('const GLOW_MSG'), html.indexOf('const EVAL_PROMPTS'));
const { GLOW_MSG, GLOW_CON, FIN_MSG, WELL_MSG } = new Function(top + '\nreturn {GLOW_MSG,GLOW_CON,FIN_MSG,WELL_MSG};')();
const cs = html.indexOf('S.contracts=[') + 'S.contracts='.length;
const seeded = new Function('GLOW_CON', 'GLOW_MSG', 'return ' + html.slice(cs, html.indexOf('function upsertContract')).trim().replace(/;$/, ''))(GLOW_CON, GLOW_MSG);

let failed = false;
const ok = (name, pass, note = '') => { console.log((pass ? 'PASS ' : 'FAIL ') + name + (note ? ' - ' + note : '')); if (!pass) failed = true; };

// ---- hero numbers must not move ----
const G = analyze(GLOW_MSG, GLOW_CON);
ok('hero numbers unchanged', G.indicative === 70000 && G.low === 62000 && G.high === 70000 && G.counter.max === 68000 && G.risks.length === 4 && G.confidence === 'Medium' && G.evidence.tier === 2 && G.evidence.count === 12);
ok('seeded contracts raise no liability/indemnity/tax risk', seeded.every((c) => !analyze(c.msg || '', c.text).risks.some((r) => ['indemnity', 'liability', 'tax'].includes(r.key))) && !analyze(FIN_MSG, '').risks.some((r) => ['indemnity', 'liability', 'tax'].includes(r.key)) && !analyze(WELL_MSG, '').risks.some((r) => ['indemnity', 'liability', 'tax'].includes(r.key)));
ok('every GlowSkin issue carries a rupee value', G.risks.every((r) => r.value && r.value.length > 3), G.risks.map((r) => r.key + ': ' + r.value).join(' | ').slice(0, 160));

// ---- guardrail 3: escalate on liability, indemnity, tax ----
const L = analyze('Brand wants 1 Reel for ₹20,000. TDS applies.', '1. Creator will indemnify and hold harmless the Brand against all claims.\n2. Liability is uncapped. GST extra.');
ok('indemnity and liability are flagged HIGH and escalated', L.escalate && L.risks.some((r) => r.key === 'indemnity' && r.sev === 'HIGH') && L.risks.some((r) => r.key === 'liability' && r.sev === 'HIGH'), L.escalateWhy.join('; '));
ok('tax is flagged and sent to a CA, not a lawyer', L.risks.some((r) => r.key === 'tax') && L.taxNote === true && /CA/.test(L.risks.find((r) => r.key === 'tax').value));

// ---- guardrail 2: confidence capped by tier and n ----
const plain = analyze('Hello, 1 Reel for ₹30,000. Net-30, 30 days organic usage, no exclusivity, one revision.', '');
ok('3 own deals cannot give High confidence', plain.confidence === 'Medium' && /under 5/.test(plain.evidence.text), plain.confidence + ' / ' + plain.evidence.text.slice(0, 60));
const ck = checkRate({ platform: 'Instagram', followers: 30000, eng: 3, deliver: 'reel', usage: 'org30', excl: 'none', last: 40000 });
ok('checker with 1 reported deal stays Low', ck.conf === 'Low' && /under 5/.test(ck.tier), ck.conf + ' / ' + ck.tier);
ok('no history stays Low, Tier 3', analyze('I have never done a brand deal. A brand offered ₹20,000 for one LinkedIn post.', '').confidence === 'Low');

// ---- spec eval #3: prices the lockout ----
const lock = analyze('A brand offered 25,000 with 6-month exclusivity.', '');
ok('exclusivity-only offer: prices the lockout and shows the category blocked', lock.lockout && lock.lockout.amount === 12000 && /exclusiv/i.test(lock.headline) && /12,000/.test(lock.headline) && /category/.test(lock.headline) && /25,000/.test(lock.headline), lock.headline.slice(0, 110));

// ---- spec eval #1: low-confidence range, not scaled by followers ----
const e1 = analyze('I have 80,000 followers and 0.2% engagement. A brand offered ₹40,000 for one Reel.', '');
const e1b = analyze('I have 800,000 followers and 0.2% engagement. A brand offered ₹40,000 for one Reel.', '');
ok('low-engagement case: Low-confidence range that ignores follower count', e1.confidence === 'Low' && e1.low === 27000 && e1.high === 44000 && e1.low === e1b.low && e1.risks[0].key === 'engagement');

// ---- spec eval #10: correlation, not cause ----
const g1 = special('Followers +25% but deals flat');
const g2 = special('My followers are up 25% but my deals are flat. Should I raise my rate?');
const gt = g1 ? g1.body.join(' ') : '';
ok('growth-versus-deals question gets correlation-not-cause and tests', g1 && g2 && g1.kind === 'growth' && /correlation/i.test(gt) && /Three tests/.test(gt) && !/you should (raise|increase)/i.test(gt));
ok('normal offers are not mistaken for a growth question', [GLOW_MSG, FIN_MSG, WELL_MSG].every((m) => special(m) === null));
ok('bare comma-grouped amounts are read, follower counts are not', parseAmount('A brand offered 25,000 with exclusivity.') === 25000 && parseAmount('I have 80,000 followers and ₹40,000 offer') === 40000 && parseAmount('I have 80,000 followers.') === null);

// ---- guardrail 1: verifier rejects uncited figures ----
ok('figure parser handles k, lakh, rupees and commas', (() => { const f = figuresIn('₹68k, Rs. 1,25,000 and ₹5 lakh, 30000 rupees'); return f.includes(68000) && f.includes(125000) && f.includes(500000) && f.includes(30000); })());
const allowed = allowedFigures(G, GLOW_MSG + '\n' + GLOW_CON);
const model = { headline: 'The licence, not the fee, is the headline issue here for this offer.', confidence: 'Medium', risks: [{ key: 'perpetual', consequence: 'The brand could earn ₹5 lakh from your content without paying you again.' }, { key: 'exclusivity', consequence: 'You give up offers worth about ₹12,000 for six months at the reference rate.' }], unknowns: ['Whether a ₹9,99,999 bonus applies.', 'Paid media duration is not specified.'] };
const rd = reconcileDeal(G, model, allowed);
const perp = rd.risks.find((r) => r.key === 'perpetual'), excl = rd.risks.find((r) => r.key === 'exclusivity');
ok('invented ₹5 lakh is dropped and replaced by the engine text', !/5 lakh/.test(perp.consequence) && perp.consequence === G.risks.find((r) => r.key === 'perpetual').consequence);
ok('a cited figure (₹12,000, the engine\'s own number) is kept', /12,000/.test(excl.consequence) && excl.consequence.startsWith('You give up'));
ok('unknown containing an invented figure is dropped', !rd.unknowns.some((u) => /9,99,999/.test(u)) && rd.verifier.rejected === 2, 'rejected ' + rd.verifier.rejected);
ok('contract text with an invented figure falls back to the engine wording', (() => { const out = reconcileContract(G, { issues: [{ key: 'payment', reading: 'You wait 90 days and could lose ₹4 lakh in interest.', consequence: 'ok consequence sentence', suggestion: 'ask for net-30 payment' }] }, GLOW_CON, missingTerms, allowed); const p = out.issues.find((i) => i.key === 'payment'); return !/4 lakh/.test(p.reading) && out.verifier.rejected === 1; })());
const dOk = validateDraft({ draft: 'Thanks for the brief. My rate for the package as written is ₹68,000, or I can work to your ₹30,000 budget with 30-day organic usage. All posts will carry the paid partnership label.', trades: [] }, 68000, INR, 'All posts will carry the paid partnership label.', GLOW_MSG, allowed);
const dBad = validateDraft({ draft: 'Thanks for the brief. My rate for the package as written is ₹68,000, plus a ₹25,000 production fee that I made up. All posts will carry the paid partnership label.', trades: [] }, 68000, INR, 'x', GLOW_MSG, allowed);
ok('draft with only cited figures passes; draft with an invented figure is rejected', !!dOk && dBad === null);
ok('autopsy with a rupee figure is rejected', validateAutopsy({ ret3: -2 }, { confidence: 'INSUFFICIENT EVIDENCE', answer: 'I do not have enough evidence to identify why; you may have lost ₹50,000 though.', observed: ['Reach -42%'], hypotheses: [] }) === null);

process.exit(failed ? 1 : 0);
