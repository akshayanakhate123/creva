// Tests the features the product spec promised: signing a deal (north star), rate card, proof pack, invoices,
// reminders, barter cash-ask, plan limits, walk-away with the saved minimum fee, and a profile photo that survives a reload.
// Renders the real screens in jsdom, engine only, no network. Run: node scripts/test-build.js
import { createApp } from './jsdom-app.js';

const app = await createApp();
let failed = false;
const ok = (name, pass, note = '') => { console.log((pass ? 'PASS ' : 'FAIL ') + name + (note ? ' - ' + note : '')); if (!pass) failed = true; };
const show = (code) => { app.run(code + '; S._static=true; render(false); S._static=false;'); return app.text(); };
const click = async (sel) => { app.run(`document.querySelector('${sel}').click()`); await new Promise((r) => setTimeout(r, 30)); };

// ---- rate card ----
let t = show("S.route='ratecard'");
ok('rate card shows the reference rates and the content / rights split', /₹38,000/.test(t) && /Content in the GlowSkin example\s*₹47,000/.test(t) && /Rights in the GlowSkin example\s*₹25,000/.test(t) && /₹42,000\s*\|\s*₹51,000\s*\|\s*₹57,000/.test(t));
ok('rate card says how Tier 2 is labelled', /demo data/.test(t) && /Fewer than 5 of your own deals cannot raise it/.test(t));
ok('rate card has an export (Pro)', /Download CSV/.test(t) && app.run('rateCardCsv()').split('\n').length > 12);

// ---- deals: mark as signed (the north-star event), invoice, proof pack, export ----
t = show("S.route='deals'; S.dealTab='active'; S.dealId='glow'");
ok('deal workspace offers Mark as signed', /Mark as signed/.test(t));
await click('[data-a="sign-open"][data-kind="signed"]');
app.run("S.signForm.amount=58000; S.signForm.date='2026-10-02'");
await click('[data-a="sign-save"]');
ok('signing records the date, the fee and the status', app.run("(()=>{const d=dealById('glow'); return d.terms.signedAt==='2026-10-02'&&d.closed===58000&&d.status==='Signed'&&d.reqs.find(r=>r.name==='Contract').done;})()"));
t = show('');
ok('the deal now shows as signed', /Signed 2 Oct 2026/.test(t));

await click('[data-a="inv-open"]');
app.run("S.invForm.gstPct=18; S.invForm.issuedAt='2026-10-10'; S.invForm.days=30; S.invForm.no='INV-2026-001'");
await click('[data-a="inv-save"]');
ok('invoice maths: ₹58,000 + 18% GST = ₹68,440, due 30 days later', app.run("(()=>{const i=dealById('glow').terms.invoice; return i.amount===58000&&i.gst===10440&&i.total===68440&&i.dueAt==='2026-11-09';})()"));
ok('payment row follows the invoice', app.run("(()=>{const p=dealById('glow').pay; return p.invoiced===68440&&p.dueDate==='2026-11-09'&&p.status==='Invoiced'&&dealById('glow').status==='Awaiting payment';})()"));
const inv = app.run("invoiceHtml(dealById('glow'))");
ok('invoice document has the number, total, GST and says CreVa did not send it', /INV-2026-001/.test(inv) && /₹68,440/.test(inv) && /GST at 18%/.test(inv) && /CreVa did not send this invoice/.test(inv) && /^<!doctype html>/.test(inv));
const proof = app.run("proofHtml(dealById('glow'))");
ok('proof pack has the terms, checklist, invoice and payment', /Proof pack: GlowSkin/.test(proof) && /Deliverables checklist/.test(proof) && /Invoice and payment/.test(proof) && /signed 2 Oct 2026/.test(proof) && /₹58,000/.test(proof));
const csv = app.run('dealsCsv()');
ok('deals export has a header and one row per deal', csv.split('\n').length === 7 && /^Brand,Deliverables,Status/.test(csv) && /GlowSkin/.test(csv));

// ---- reminders ----
ok('the overdue WellnessCo invoice raises a reminder', app.run("remList().some(x=>x.d.id==='wellnessco'&&x.kind==='late'&&x.days>0)"));
t = show("S.route='home'");
ok('Home shows the overdue payment from the deals, with a Chase button', /WellnessCo/.test(t) && /days? late/.test(t));
await click('[data-a="reminders"]');
ok('the bell opens a reminders panel', /Reminders/.test(app.window.document.getElementById('rempanel').textContent) && /Reminders are shown to you only/.test(app.window.document.getElementById('rempanel').textContent));
app.run('S.remOpen=false; renderRem()');
t = show("S.route='payments'");
ok('Payments lists open invoices with totals', /Invoices/.test(t) && /GlowSkin/.test(t) && /WellnessCo/.test(t));
await click('[data-a="mark-received"][data-id="wellnessco"]');
ok('marking received settles the payment and the reminder goes away', app.run("(()=>{const d=dealById('wellnessco'); return d.status==='Paid'&&d.pay.received===22000&&d.pay.status==='Paid'&&!remList().some(x=>x.d.id==='wellnessco');})()"));
ok('the chase draft names the invoice and never claims to be sent', (() => { const d = app.run("chaseDraftFor(dealById('glow'))"); return /GlowSkin/.test(d) && /INV-2026-001/.test(d) && !/I have sent|has been sent/.test(d); })());

// ---- barter: the cash-ask draft ----
app.run("loadOffer('well'); S.A=analyze(S.msg,S.con); S.mode=''; setDraft();");
t = show("S.route='negotiate'");
ok('barter negotiate explains gifting versus paid', /A product is a gift, not a fee/.test(t) && /₹8,000/.test(t) && /9%/.test(t));
const bd = app.run('S.draft');
ok('barter draft asks for cash, offers a reduced scope, carries the disclosure', /cash rate for two Reels and four Stories is ₹86,000/.test(bd) && /one Reel and two Stories for ₹36,000 in cash plus the product/.test(bd) && /paid partnership label/.test(bd), bd.slice(0, 90));
ok('barter draft never claims to have been sent', !/I have sent|has been sent/.test(bd));

// ---- walk-away uses the saved minimum fee ----
const w1 = app.run("special('The brand says ₹15,000 is final. Should I walk away?',{minFee:30000}).body.join(' ')");
const w2 = app.run("special('The brand says ₹45,000 is final. Should I walk away?',{minFee:30000}).body.join(' ')");
const w3 = app.run("special('The brand says ₹15,000 is final. Should I walk away?').body.join(' ')");
ok('below the saved minimum: says so and by how much', /saved minimum fee for one Reel is ₹30,000/.test(w1) && /₹15,000 is ₹15,000 below it/.test(w1) && !/minimum acceptable fee/.test(w1));
ok('above the saved minimum: the real question is the scope', /at or above it/.test(w2));
ok('without a saved minimum it still lists it as unknown', /your minimum acceptable fee/.test(w3));

// ---- plans: Free = rate checker, 2 analyses a month, basic rate card ----
app.run("S.profile.plan='Free'; S.usage.dealAnalyses=0");
t = show("S.route='contracts'; S.cid=null");
ok('Free plan: contract review is locked with a demo upgrade', /Contract review is part of the Pro plan/.test(t) && /No payment is taken/.test(t));
ok('Free plan: negotiate, deals and payments are locked', ['negotiate', 'deals', 'payments'].every((r) => /part of the Pro plan/.test(show(`S.route='${r}'`))));
t = show("S.route='growth'; S.tab='autopsy'");
ok('Free plan: Post Autopsy is locked', /Post Autopsy is part of the Pro plan/.test(t));
t = show("S.route='ratecard'");
ok('Free plan: the basic rate card has no priced example and no export', !/Content in the GlowSkin example/.test(t) && !/Download CSV/.test(t) && /Basic rate card/.test(t));
app.run("loadOffer('glow'); S.route='rate'; S.usage.dealAnalyses=1;"); show("S.route='rate'");
ok('Free plan shows how many analyses are used', /1 of 2 analyses used this month/.test(app.text()));
app.run("S.usage.dealAnalyses=2"); await app.run('runAnalysis()');
t = show("S.route='rate'");
ok('Free plan: the third analysis is stopped with an upgrade prompt', /You have used the 2 analyses included in the Free plan/.test(t) && app.run('S.A')===null);
app.run("S.profile.plan='Pro'; S.limitHit=false");
ok('Pro plan unlocks everything again', !/part of the Pro plan/.test(show("S.route='deals'; S.dealTab='active'")));

// ---- profile photo and plan survive a reload (they travel with the profile) ----
const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT';
app.run(`S.profile.avatar.photo=${JSON.stringify(photo)}; S.profile.avatar.seed=4242; S.profile.plan='Founding'`);
const api = JSON.parse(JSON.stringify(app.run('profileToApi()')));
ok('the photo, its seed and the plan are part of what is saved', api.preferences.avatar === photo && api.preferences.avatarSeed === 4242 && api.preferences.plan === 'Founding');
app.run(`S.profile.avatar.photo=null; S.profile.avatar.seed=1; S.profile.plan='Pro'; profileFromApi(${JSON.stringify(api)})`);
ok('after a reload the photo, seed and plan come back', app.run('S.profile.avatar.photo') === photo && app.run('S.profile.avatar.seed') === 4242 && app.run('S.profile.plan') === 'Founding');
app.run('refreshAvatar()');
ok('the restored photo is what the avatar shows', /<img[^>]+src="data:image\/jpeg/.test(app.window.document.querySelector('.topbar .av').innerHTML));

// ---- a blank brand name (Custom / Other) must not break the analysis, the draft or the contract list ----
app.run("S.brandName=''; S.site=''; S.msg='Brand offered ₹18,000 for one Reel. Contract says they can use it in paid ads forever, worldwide.'; S.con=''; S.A=analyze(S.msg,S.con); S.mode='fallback'");
ok('blank brand name gives a label instead of crashing', app.run('brandOf()') === 'Unnamed brand');
t = show("S.route='rate'");
ok('Deal Intelligence renders for a custom offer with no brand name', /KEY RISKS|Key risks/i.test(t) && /perpetual/i.test(t));
t = show("S.route='negotiate'; setDraft()");
ok('a counter draft can be built with no brand name', app.run('S.draft').length > 40);

// ---- Ask CreVa: questions that are not offers have their own screen, and it asks which post or offer when it cannot tell ----
t = show("S.route='ask'; S.askAns=null; S.askText=''; S.askPost=''; S.askOffer=''");
ok('Ask CreVa is in the menu and shows a question box, post and offer pickers and examples', /Ask CreVa/.test(app.text()) && !!app.window.document.getElementById('askq') && !!app.window.document.getElementById('ask_post') && !!app.window.document.getElementById('ask_offer') && /Try one/.test(t));
const ask = async (q) => { app.run('S.askText=' + JSON.stringify(q)); await click('[data-a="ask-go"]'); return app.text(); };
const reset = () => show("S.route='ask'; S.askAns=null; S.askPost=''; S.askOffer=''");

// which Reel?
t = await ask('Why did my Reel flop?');
ok('flop with no post: asks which post, says it has not enough evidence, guesses nothing', /Which post do you mean/.test(t) && /enough evidence/.test(t) && /2 Oct/.test(t) && /21 Sep/.test(t) && !/other metrics you gave/.test(t));
await click('[data-a="ask-pick"][data-k="post"][data-v="oct2"]');
t = app.text();
ok('after picking the 2 Oct Reel it reads that post: its numbers, no invented cause', /2 Oct/.test(t) && /Reach -42%/.test(t) && /enough evidence/.test(t) && /OPEN POST AUTOPSY FOR THIS POST/.test(t));
await click('[data-a="special-go"][data-r="autopsy"]');
ok('Open Post Autopsy lands on the same post', app.run('S.route') === 'growth' && app.run('S.post') === 'oct2');
reset(); await click('[data-a="ask-chip"][data-i="0"]'); app.run("S.askPost='sep21'"); t = await ask('Why did my Reel flop?');
ok('21 Sep Reel is read differently (weak early retention)', /21 Sep/.test(t) && /retention/i.test(t));
t = await ask('Why did my Reel flop? Reach is 40% down but everything else is normal.');
ok('if the creator gives the numbers in the question, those are used', /You said reach is down 40%/.test(t));
ok('the rule answer never claims metrics that were not given', !/other metrics you gave/.test(app.run("special('Why did my Reel flop?').body.join(' ')")));

// which offer?
reset(); t = await ask('The brand says ₹15,000 is final. Should I walk away?');
ok('walk away with no offer: asks which offer', /Which offer is this about/.test(t) && /GlowSkin/.test(t) && /WellnessCo/.test(t));
await click('[data-a="ask-pick"][data-k="offer"][data-v="glow"]');
t = app.text();
ok('after picking GlowSkin it compares ₹15,000 with that package: ₹62,000 to ₹70,000, ₹47,000 below', /₹62,000 to ₹70,000/.test(t) && /₹47,000 below the bottom/.test(t) && /Walking away is one option/.test(t) && !/you should walk away/i.test(t));
app.run("S.profile.minFee=30000"); t = await ask('The brand says ₹15,000 is final. Should I walk away?'); app.run("S.profile.minFee=''");
ok('with a saved minimum fee it also quotes the saved floor', /saved minimum fee for one Reel is ₹30,000/.test(t));
reset(); t = await ask('The brand says ₹65,000 is final. Should I walk away?'); await click('[data-a="ask-pick"][data-k="offer"][data-v="glow"]');
ok('a price inside the fair range is described as such', /inside or above that range/.test(app.text()));
reset(); t = await ask('The brand says ₹15,000 is final. Should I walk away?'); await click('[data-a="ask-pick"][data-k="offer"][data-v="well"]');
ok('a barter offer has no cash figure to compare with', /product only, so there is no cash fee/.test(app.text()));

// accept and send
reset(); t = await ask('Accept and send it for me');
ok('accept and send: declined, and asks which offer before building a counter', /will not accept, sign or send for you/i.test(t) && /Build a counter for GlowSkin/.test(t));
app.run("S.askOffer='glow'"); t = await ask('Accept and send it for me');
ok('with GlowSkin selected the refusal names it and offers a counter for it', /GlowSkin offer for you/.test(t) && /BUILD A COUNTER FOR GLOWSKIN/.test(t));
await click('[data-a="special-go"][data-o="glow"]');
ok('the counter button opens Negotiate for that offer', app.run('S.route') === 'negotiate' && app.run('S.brandName') === 'GlowSkin' && /68,000/.test(app.run('S.draft')));

// other
reset(); t = await ask('Write a caption for my GlowSkin serum post.');
ok('caption request: draft with the disclosure label', /Paid partnership with GlowSkin/.test(t) && !/cures|clinically|guarantee/i.test(t));
t = await ask('My followers are up 25% but deals are flat');
ok('followers up, deals flat: correlation not cause', /correlation/i.test(t));
t = await ask('Brand offered ₹30,000 for one Reel');
ok('an offer is pointed to Rate Intelligence', /Not answered here/.test(t) && /ANALYZE AS AN OFFER/.test(t));
await click('[data-a="ask-offer"]');
ok('Analyze as an offer carries the text to Rate Intelligence', app.run('S.route') === 'rate' && app.run('S.msg') === 'Brand offered ₹30,000 for one Reel');
app.run("S.profile.plan='Free'");
t = await (async () => { reset(); return ask('Why did my Reel flop?'); })();
ok('Ask CreVa stays available on the Free plan', /Which post do you mean/.test(t) && !/part of the Pro plan/.test(t));
app.run("S.profile.plan='Pro'");

app.close();
process.exit(failed ? 1 : 0);
