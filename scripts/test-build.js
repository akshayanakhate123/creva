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

app.close();
process.exit(failed ? 1 : 0);
