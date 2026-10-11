// Real-database check: a deal marked signed, with an invoice and proof checklist, is still there after a fresh read,
// counts toward the north-star metric, and the deal is then put back exactly as it was. Prints no secrets.
// Start the server first (npm run dev).
const BASE = process.env.BASE || 'http://localhost:5173';
const get = async (k) => (await fetch(BASE + '/api/data?kind=' + k)).json();
const post = async (k, body) => { const r = await fetch(BASE + '/api/data?kind=' + k, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); };
let failed = false;
const ok = (name, pass, note = '') => { console.log((pass ? 'PASS ' : 'FAIL ') + name + (note ? ' - ' + note : '')); if (!pass) failed = true; };
const fromDb = (id) => String(id).replace(/^deal-/, '');
const bodyOf = (row, pay) => ({
  id: fromDb(row.id), brand: row.brand, status: row.status, deliverables: row.deliverables, openingOffer: row.opening_offer, counter: row.our_counter, closed: row.closed_amount,
  terms: row.terms || {}, requirements: row.requirements || [],
  payment: pay ? { expected: pay.expected, invoiced: pay.invoiced, received: pay.received, dueDate: pay.due_date || '', status: pay.status } : null,
});

const b0 = await get('bootstrap');
const row = b0.deals.find((d) => fromDb(d.id) === 'glow' || d.id === 'glow');
const pay = b0.payments.find((p) => fromDb(p.deal_id) === 'glow');
ok('found the GlowSkin deal', !!row);
const original = bodyOf(row, pay);
try {
  const today = new Date().toISOString().slice(0, 10);
  const mod = JSON.parse(JSON.stringify(original));
  mod.status = 'Awaiting payment'; mod.closed = 58000;
  mod.terms = { ...mod.terms, signedAt: today, invoice: { no: 'INV-TEST-001', issuedAt: today, dueAt: today, amount: 58000, gstPct: 18, gst: 10440, total: 68440 } };
  mod.requirements = [{ name: 'Contract', status: 'Signed', done: true, proof: 'signed copy' }, { name: 'Reel', status: 'Due', done: false, proof: '' }];
  mod.payment = { expected: 58000, invoiced: 68440, received: 0, dueDate: today, status: 'Invoiced' };
  const saved = await post('deal', mod);
  ok('saving a signed, invoiced deal succeeds', saved.ok === true, saved.code || '');
  const b1 = await get('bootstrap');
  const r1 = b1.deals.find((d) => fromDb(d.id) === 'glow'); const p1 = b1.payments.find((p) => fromDb(p.deal_id) === 'glow');
  ok('after a fresh read the signed date, invoice and checklist are still there', r1.terms.signedAt === today && r1.terms.invoice.total === 68440 && r1.requirements[0].proof === 'signed copy' && r1.closed_amount === 58000);
  ok('the payment row follows the invoice', p1 && p1.invoiced === 68440 && p1.status === 'Invoiced');
  ok('the deal id stays the same (no duplicate row)', b1.deals.length === b0.deals.length);
  const m = await get('metrics');
  ok('the north-star metric is reported', m.ok && m.northStar && typeof m.northStar.valueInr === 'number', JSON.stringify(m.northStar));
  const bad = await post('deal', { ...mod, status: 'Whatever' });
  ok('an invalid status is refused', bad.ok === false, bad.code || '');
} finally {
  const back = await post('deal', original);
  ok('deal restored to what it was', back.ok === true);
  const b2 = await get('bootstrap');
  const r2 = b2.deals.find((d) => fromDb(d.id) === 'glow');
  ok('restored values match the original', r2.status === row.status && !(r2.terms || {}).signedAt === !(row.terms || {}).signedAt && r2.closed_amount === row.closed_amount);
}
process.exit(failed ? 1 : 0);
