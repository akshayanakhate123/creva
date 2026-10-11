// Shapes, validation and row mapping for /api/data. The browser speaks the "API shape"; the database has its own columns.
// Everything the browser sends is validated here: types, lengths, enums. Unknown keys are dropped.
import { DEMO_USER } from './supabase.js';

const intOrNull = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '');
const strArr = (v, maxItems, maxLen) => (Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : []);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const HANDLE = /^[A-Za-z0-9._-]{0,40}$/;
const PLATFORMS = ['ig', 'li', 'yt', 'x', 'fb', 'th'];
export const PLANS = ['Free', 'Founding', 'Pro'];
export const MAX_AVATAR = 140_000; // characters of base64; the browser downscales to about 256px first
const AVATAR = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

// ---------- profile ----------
export function validateProfile(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'bad_request' };
  const name = str(b.name, 80);
  if (!name) return { error: 'bad_request' };
  const email = str(b.email, 120);
  if (email && !EMAIL.test(email)) return { error: 'bad_request' };
  const dob = typeof b.dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.dob) ? b.dob : null;
  const social = (Array.isArray(b.social) ? b.social : [])
    .filter((s) => s && PLATFORMS.includes(s.id))
    .slice(0, 10)
    .map((s) => ({
      id: s.id,
      active: s.active === true,
      handle: HANDLE.test(String(s.handle || '')) ? String(s.handle || '') : '',
      followers: intOrNull(s.followers, 0, 1e9),
      avg: intOrNull(s.avg, 0, 1e9),
      conn: s.conn === true,
    }));
  const ig = social.find((s) => s.id === 'ig') || {};
  const li = social.find((s) => s.id === 'li') || {};
  const inv = b.invoicing && typeof b.invoicing === 'object' ? b.invoicing : {};
  const pref = b.preferences && typeof b.preferences === 'object' ? b.preferences : {};
  const aud = b.audience && typeof b.audience === 'object' ? b.audience : {};
  return {
    value: {
      id: DEMO_USER,
      name,
      gender: str(b.gender, 30) || null,
      email: email || null,
      phone: str(b.phone, 30) || null,
      dob,
      city: str(b.city, 60) || null,
      state: str(b.state, 60) || null,
      bio: str(b.bio, 300) || null,
      niche: str(b.niche, 60) || null,
      min_fee_inr: b.minFeeInr == null || b.minFeeInr === '' ? null : intOrNull(Number(b.minFeeInr), 0, 1e9),
      topics: strArr(b.topics, 20, 30),
      languages: strArr(b.languages, 12, 30),
      audience: { age: str(aud.age, 40), cities: str(aud.cities, 120) },
      instagram_handle: ig.active && ig.handle ? ig.handle : null,
      instagram_followers: ig.active ? ig.followers : null,
      linkedin_handle: li.active && li.handle ? li.handle : null,
      linkedin_followers: li.active ? li.followers : null,
      social,
      invoicing: { invoiceName: str(inv.invoiceName, 80), gst: ['Registered', 'Not registered'].includes(inv.gst) ? inv.gst : 'Not registered', gstin: str(inv.gstin, 20), upi: str(inv.upi, 60) },
      preferences: {
        newOffers: pref.newOffers !== false, paymentReminders: pref.paymentReminders !== false, disclosureChecks: pref.disclosureChecks !== false,
        plan: PLANS.includes(pref.plan) ? pref.plan : 'Pro',
        // The profile photo is a small, downscaled image kept with the profile so it survives a reload. Only image data URLs are accepted.
        avatar: typeof pref.avatar === 'string' && pref.avatar.length <= MAX_AVATAR && AVATAR.test(pref.avatar) ? pref.avatar : '',
        avatarSeed: intOrNull(pref.avatarSeed, 0, 1e9),
      },
      updated_at: new Date().toISOString(),
    },
  };
}

export function profileFromRow(r) {
  if (!r) return null;
  const inv = r.invoicing || {};
  const pref = r.preferences || {};
  const aud = r.audience || {};
  return {
    name: r.name || '',
    gender: r.gender || '',
    email: r.email || '',
    phone: r.phone || '',
    dob: r.dob || '',
    city: r.city || '',
    state: r.state || '',
    bio: r.bio || '',
    niche: r.niche || '',
    minFeeInr: r.min_fee_inr == null ? '' : r.min_fee_inr,
    topics: r.topics || [],
    languages: r.languages || [],
    audience: { age: aud.age || '', cities: aud.cities || '' },
    instagram: { handle: r.instagram_handle || '', followers: r.instagram_followers },
    linkedin: { handle: r.linkedin_handle || '', followers: r.linkedin_followers },
    social: Array.isArray(r.social) ? r.social : [],
    invoicing: { invoiceName: inv.invoiceName || inv.invoice_name || '', gst: inv.gst || 'Not registered', gstin: inv.gstin || '', upi: inv.upi || '' },
    preferences: {
      newOffers: pref.newOffers ?? pref.new_offers ?? true,
      paymentReminders: pref.paymentReminders ?? pref.payment_reminders ?? true,
      disclosureChecks: pref.disclosureChecks ?? pref.disclosure_checks ?? true,
      plan: PLANS.includes(pref.plan) ? pref.plan : 'Pro',
      avatar: typeof pref.avatar === 'string' ? pref.avatar : '',
      avatarSeed: Number.isInteger(pref.avatarSeed) ? pref.avatarSeed : null,
    },
  };
}

// ---------- contracts ----------
const STATES = ['reviewed', 'cleared', 'dismissed'];
const ISSUE_KEYS = ['perpetual', 'exclusivity', 'payment', 'revisions', 'paidmedia', 'barter', 'ip', 'engagement', 'usage', 'indemnity', 'liability', 'tax'];
const CONTRACT_STATUS = ['Needs review', 'In review', 'Reviewed', 'Cleared', 'Signed', 'Clear'];
export const MAX_CONTRACT_BODY = 30_000;
export const MAX_CONTRACTS = 50;

export const toDbContractId = (id) => (id === 'glow' ? 'ctr-glowskin' : 'ctr-' + id);
export const fromDbContractId = (id) => (id === 'ctr-glowskin' ? 'glow' : String(id).replace(/^ctr-/, ''));

export function validateContract(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'bad_request' };
  const id = typeof b.id === 'string' && /^[a-z0-9-]{1,40}$/.test(b.id) ? b.id : null;
  const brand = str(b.brand, 80);
  const body = typeof b.body === 'string' ? b.body.trim() : '';
  if (!id || !brand || body.length < 3) return { error: 'bad_request' };
  if (body.length > MAX_CONTRACT_BODY) return { error: 'too_large' };
  const states = {};
  if (b.issueStates && typeof b.issueStates === 'object') {
    for (const k of ISSUE_KEYS) if (STATES.includes(b.issueStates[k])) states[k] = b.issueStates[k];
  }
  return {
    value: {
      id: toDbContractId(id),
      user_id: DEMO_USER,
      brand,
      filename: str(b.filename, 120) || 'Pasted contract',
      body,
      message: typeof b.message === 'string' ? b.message.trim().slice(0, 2000) || null : null,
      status: CONTRACT_STATUS.includes(b.status) ? b.status : 'Needs review',
      issue_states: states,
    },
  };
}

export function contractFromRow(r) {
  return { id: fromDbContractId(r.id), brand: r.brand, file: r.filename, text: r.body, msg: r.message || '', status: r.status, states: r.issue_states || {}, createdAt: r.created_at };
}

// ---------- deals, proof pack, invoice and payment ----------
// A deal row holds the whole story: status, who signed what, the proof checklist (requirements) and the invoice (terms.invoice).
// Its payment is a second row in `payments`. No new tables are needed for any of this.
const DEAL_STATUS = ['Needs review', 'In progress', 'Accepted', 'Signed', 'Awaiting payment', 'Paid'];
const PAY_STATUS = ['Not invoiced', 'Invoiced', 'Awaiting payment', 'Overdue', 'Paid'];
export const MAX_DEALS = 50;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateOrNull = (v) => (typeof v === 'string' && DATE.test(v) ? v : null);
export const toDbDealId = (id) => (id === 'glow' ? 'deal-glowskin' : 'deal-' + id);
export const fromDbDealId = (id) => (id === 'deal-glowskin' ? 'glow' : String(id).replace(/^deal-/, ''));

export function validateDeal(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'bad_request' };
  const id = typeof b.id === 'string' && /^[a-z0-9-]{1,40}$/.test(b.id) ? b.id : null;
  const brand = str(b.brand, 80);
  if (!id || !brand || !DEAL_STATUS.includes(b.status)) return { error: 'bad_request' };
  const t = b.terms && typeof b.terms === 'object' ? b.terms : {};
  const inv = t.invoice && typeof t.invoice === 'object' ? t.invoice : null;
  const terms = {
    usage: str(t.usage, 60), exclusivity: str(t.exclusivity, 60), revisions: str(t.revisions, 40), payment: str(t.payment, 40),
    acceptedAt: dateOrNull(t.acceptedAt), signedAt: dateOrNull(t.signedAt),
  };
  if (inv) {
    const no = str(inv.no, 40);
    if (no) terms.invoice = { no, issuedAt: dateOrNull(inv.issuedAt), dueAt: dateOrNull(inv.dueAt), amount: intOrNull(inv.amount, 0, 1e9), gstPct: intOrNull(inv.gstPct, 0, 28) ?? 0, gst: intOrNull(inv.gst, 0, 1e9) ?? 0, total: intOrNull(inv.total, 0, 1e9) };
  }
  const reqs = (Array.isArray(b.requirements) ? b.requirements : []).slice(0, 12).map((r) => ({
    name: str(r && r.name, 60), status: str(r && r.status, 40), done: !!(r && r.done === true), proof: str(r && r.proof, 200),
  })).filter((r) => r.name);
  const row = {
    id: toDbDealId(id), user_id: DEMO_USER, brand, status: b.status, deliverables: str(b.deliverables, 120) || null,
    opening_offer: intOrNull(b.openingOffer, 0, 1e9), our_counter: intOrNull(b.counter, 0, 1e9), closed_amount: intOrNull(b.closed, 0, 1e9),
    terms, requirements: reqs,
  };
  let payment = null;
  const p = b.payment && typeof b.payment === 'object' ? b.payment : null;
  if (p && PAY_STATUS.includes(p.status)) {
    payment = {
      id: 'pay-' + row.id.replace(/^deal-/, ''), deal_id: row.id, expected: intOrNull(p.expected, 0, 1e9) ?? 0, invoiced: intOrNull(p.invoiced, 0, 1e9) ?? 0,
      received: intOrNull(p.received, 0, 1e9) ?? 0, due_date: dateOrNull(p.dueDate), status: p.status,
    };
  }
  return { value: { deal: row, payment } };
}

// ---------- consent-based sharing of rate-checker results ----------
// Only an anonymous summary is stored: no name, no brand, no exact follower count. Needs supabase/migration-002.sql.
const BANDS = ['under 10K', '10K to 25K', '25K to 50K', '50K to 100K', 'over 100K'];
export function validateShare(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b) || b.consent !== true) return { error: 'bad_request' };
  if (!['Instagram', 'LinkedIn'].includes(b.platform)) return { error: 'bad_request' };
  return {
    value: {
      platform: b.platform,
      followers_band: BANDS.includes(b.followersBand) ? b.followersBand : null,
      deliverable: str(b.deliverable, 40) || null,
      usage: ['org30', 'org90', 'paid', 'perp'].includes(b.usage) ? b.usage : null,
      exclusivity: ['none', 'm1', 'm3', 'm6'].includes(b.excl) ? b.excl : null,
      last_paid_inr: intOrNull(b.lastPaid, 0, 1e9),
      range_low: intOrNull(b.low, 0, 1e9),
      range_high: intOrNull(b.high, 0, 1e9),
    },
  };
}

// ---------- eval runs ----------
export function validateEval(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'bad_request' };
  const prompt = str(b.prompt, 600);
  if (!prompt || typeof b.passed !== 'boolean') return { error: 'bad_request' };
  return { value: { prompt, source: ['live', 'fallback', 'rule'].includes(b.source) ? b.source : null, passed: b.passed, notes: str(b.notes, 500) || null } };
}

// ---------- fallback events (so the "fallback rate" metric can be computed) ----------
const TASKS = ['deal', 'contract', 'negotiate', 'autopsy', 'checker'];
export function validateEvent(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b) || b.event !== 'fallback' || !TASKS.includes(b.task)) return { error: 'bad_request' };
  const reason = str(b.reason, 40).replace(/[^a-z_ -]/gi, '') || 'error';
  return { value: { user_id: DEMO_USER, input_hash: 'fallback-event', source: 'fallback', model: null, result: { _task: b.task, _reason: reason, _brand: str(b.brand, 80) }, latency_ms: null } };
}

// ---------- analyses ----------
export function analysisFromRow(r) {
  const res = r.result || {};
  return {
    id: r.id,
    createdAt: r.created_at,
    source: r.source,
    model: r.model,
    opportunityId: r.opportunity_id,
    brand: res._brand || '',
    task: res._task || (res.fair_low != null ? 'deal' : ''),
    headline: res.headline || '',
    fairLow: res.fair_low ?? null,
    fairHigh: res.fair_high ?? null,
  };
}

export function median(nums) {
  const v = [...nums].sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}
