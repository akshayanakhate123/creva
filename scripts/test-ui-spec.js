// Checks that the screens show what the product spec promises. Renders the real screens in jsdom (engine only, no network).
// Run: node scripts/test-ui-spec.js
import { createApp } from './jsdom-app.js';

const app = await createApp();
let failed = false;
const ok = (name, pass, note = '') => { console.log((pass ? 'PASS ' : 'FAIL ') + name + (note ? ' - ' + note : '')); if (!pass) failed = true; };
const show = (code) => { app.run(code + '; S._static=true; render(false); S._static=false;'); return app.text(); };

// Deal Intelligence: escalation reasons, tax note, demo-data label on the Tier 2 evidence
let t = show("loadOffer('glow'); S.A=analyze(S.msg,S.con); S.mode=''; S.route='rate'");
ok('Tier 2 evidence is labelled as demo data', /Demo data: the 12 network deals are illustrative/.test(t));
ok('perpetual licence escalates with a reason', /consider professional legal review/i.test(t) && /Why: the usage licence has no end date/.test(t));
t = show("S.msg='Brand wants 1 Reel for ₹20,000. TDS applies.'; S.con='1. Creator will indemnify and hold harmless the Brand against all claims.\\n2. Liability is uncapped. GST extra.'; S.A=analyze(S.msg,S.con); S.route='rate'");
ok('indemnity and liability escalate with the reason shown', /Why: it asks you to indemnify the brand; it mentions liability or damages/.test(t));
ok('tax is sent to a CA', /mentions tax \(GST or TDS\)\. Check how it applies with a CA/.test(t));

// Breakdown: offer as a share of the indicative value
t = show("loadOffer('glow'); S.A=analyze(S.msg,S.con); S.route='breakdown'");
ok('breakdown says the offer is 43% of the indicative value', /Their offer of ₹30,000 is 43% of the indicative value/.test(t));
ok('breakdown labels the Tier 2 row as demo data', /median ₹54K \(demo data\)/.test(t));

// Contract review: every issue is priced in rupees
t = show("S.cid='glow'; openContract('glow'); S.route='contracts'");
ok('contract issues show what they are priced at', /Priced at\s*\+₹12,000/.test(t) && /Priced at\s*-₹2,000 cash-flow cost/.test(t) && /Priced at\s*\+₹3,000/.test(t) && /Priced at\s*Not in the indicative value/.test(t));

// Post Autopsy: Evidence / Inference / Unknown, and the data that would help
t = show("S.route='growth'; S.tab='autopsy'; S.post='oct2'; S.auto.oct2=Object.assign({mode:'fallback'},autopsyRule(POSTS.find(x=>x.id==='oct2')))");
ok('autopsy is labelled Evidence, Inference, Unknown', /Evidence/.test(t) && /Inference/.test(t) && /Unknown/.test(t) && !/Observed|Hypothesis, not a finding/.test(t));
ok('insufficient-evidence autopsy lists the data that would help', /Data that would help: retention beyond the first 3 seconds/.test(t));
t = show("S.post='sep21'; S.auto.sep21=Object.assign({mode:'fallback'},autopsyRule(POSTS.find(x=>x.id==='sep21')))");
ok('an autopsy with a hypothesis marks it as not proven', /Inference \(not proven\)/.test(t));

// Growth question: special panel with a button into Rate Growth
t = show("S.msg='Followers +25% but deals flat'; S.con=''; S.A=null; S.special=special(S.msg); S.mode='rule'; S.route='rate'");
ok('growth question shows the correlation answer and an Open Rate Growth button', /Correlation, not cause/.test(t) && /OPEN RATE GROWTH/i.test(t));
app.run("document.querySelector('[data-a=\"special-go\"]').click()");
await new Promise((r) => setTimeout(r, 50));
ok('the button opens Growth on the Rate growth tab', app.run('S.route') === 'growth' && app.run('S.tab') === 'rate');

app.close();
process.exit(failed ? 1 : 0);
