// Shapes, validation and row mapping for /api/data. The browser speaks the "API shape"; the database has its own columns.
// Everything the browser sends is validated here: types, lengths, enums. Unknown keys are dropped.
import { DEMO_USER } from './supabase.js';

const intOrNull = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '');
const strArr = (v, maxItems, maxLen) => (Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : []);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const HANDLE = /^[A-Za-z0-9._-]{0,40}$/;
const PLATFORMS = ['ig', 'li', 'yt', 'x', 'fb', 'th'];

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
      preferences: { newOffers: pref.newOffers !== false, paymentReminders: pref.paymentReminders !== false, disclosureChecks: pref.disclosureChecks !== false },
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
    },
  };
}

// ---------- contracts ----------
const STATES = ['reviewed', 'cleared', 'dismissed'];
const ISSUE_KEYS = ['perpetual', 'exclusivity', 'payment', 'revisions', 'paidmedia', 'barter', 'ip', 'engagement', 'usage'];
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

// ---------- eval runs ----------
export function validateEval(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'bad_request' };
  const prompt = str(b.prompt, 600);
  if (!prompt || typeof b.passed !== 'boolean') return { error: 'bad_request' };
  return { value: { prompt, source: ['live', 'fallback', 'rule'].includes(b.source) ? b.source : null, passed: b.passed, notes: str(b.notes, 500) || null } };
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
