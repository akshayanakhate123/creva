// Input validation, output schemas, output validation and reconciliation for /api/ai.
// Principle: the ENGINE owns the numbers; the model only explains. Model output is untrusted data.

export const TASKS = ['deal', 'contract', 'negotiate', 'autopsy', 'checker'];
export const MODES = ['max', 'rel', 'pres'];

// Token budget. Free tier is about 8K tokens/min, so keep each call small. About 4 characters per token.
export const MAX_BODY_BYTES = 20_000;
export const MAX_MESSAGE = 2000;
export const MAX_CONTRACT = 6000;
export const MAX_BRAND = 80;
export const MAX_INPUT_CHARS = 14_000; // about 3,500 tokens for system + data combined
export const MAX_OUTPUT_TOKENS = 1100; // includes reasoning tokens on gpt-oss models (docs are silent), so leave headroom

const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const str = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const MARK = /<<<DATA|DATA>>>/g;
// Remove our delimiter strings from untrusted text so it cannot break out of the data block.
export const defang = (s) => s.replace(MARK, '[marker removed]');

export function validateInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'bad_request' };
  const task = body.task;
  if (!TASKS.includes(task)) return { error: 'bad_request' };
  const raw = (k) => (body[k] == null ? '' : body[k]);
  if (typeof raw('message') !== 'string' || (body.contract != null && typeof body.contract !== 'string')) return { error: 'bad_request' };
  if (body.brand != null && typeof body.brand !== 'string') return { error: 'bad_request' };
  if (body.mode != null && !MODES.includes(body.mode)) return { error: 'bad_request' };
  if (raw('message').length > MAX_MESSAGE * 3 || String(raw('contract')).length > MAX_CONTRACT * 5) return { error: 'too_large' };

  const message = raw('message').trim();
  if ((task === 'deal' || task === 'contract' || task === 'negotiate') && message.length < 3) return { error: 'bad_request' };
  let contract = String(raw('contract')).trim();
  const contractTruncated = contract.length > MAX_CONTRACT;
  if (contractTruncated) contract = contract.slice(0, MAX_CONTRACT);

  const c = body.context && typeof body.context === 'object' && !Array.isArray(body.context) ? body.context : {};
  const ctx = {
    profileName: str(c.profileName, 60),
    city: str(c.city, 60),
    niche: str(c.niche, 60),
    instagramFollowers: intIn(c.instagramFollowers, 0, 1e8) ? c.instagramFollowers : null,
    linkedinFollowers: intIn(c.linkedinFollowers, 0, 1e8) ? c.linkedinFollowers : null,
    closedDeals: Array.isArray(c.closedDeals) ? c.closedDeals.filter((n) => intIn(n, 1, 1e8)).slice(0, 5) : [],
    networkCount: intIn(c.networkCount, 0, 100000) ? c.networkCount : null,
    networkMedian: intIn(c.networkMedian, 0, 1e8) ? c.networkMedian : null,
    site: str(c.site, 200),
    opportunityId: /^opp-[a-z0-9-]{1,40}$/.test(c.opportunityId || '') ? c.opportunityId : null,
  };
  if (task === 'autopsy') {
    const m = c.metrics || {};
    const ok = ['reach', 'ret3', 'saves', 'shares'].every((k) => intIn(m[k], -100, 1000));
    if (!ok) return { error: 'bad_request' };
    ctx.metrics = { reach: m.reach, ret3: m.ret3, saves: m.saves, shares: m.shares };
    ctx.post = str(c.post, 120);
    ctx.window = str(c.window, 40);
  }
  if (task === 'checker') {
    const k = c.checker || {};
    if (!['Instagram', 'LinkedIn'].includes(k.platform)) return { error: 'bad_request' };
    ctx.checker = {
      platform: k.platform,
      followers: intIn(k.followers, 0, 1e8) ? k.followers : null,
      eng: typeof k.eng === 'number' && k.eng >= 0 && k.eng <= 100 ? k.eng : null,
      deliver: str(k.deliver, 20),
      usage: ['org30', 'org90', 'paid', 'perp'].includes(k.usage) ? k.usage : 'org30',
      excl: ['none', 'm1', 'm3', 'm6'].includes(k.excl) ? k.excl : 'none',
      last: intIn(k.last, 0, 1e8) ? k.last : 0,
    };
  }
  return {
    value: {
      task, brand: str(body.brand, MAX_BRAND), message: message.slice(0, MAX_MESSAGE), contract, contractTruncated, mode: body.mode || null, ctx,
      // negotiate only: the creator's own edit instruction and the current draft (both untrusted text)
      instruction: str(body.instruction, 300),
      draft: typeof body.draft === 'string' ? body.draft.trim().slice(0, 1800) : '',
    },
  };
}

// ---------- JSON schemas (strict mode: every property required, additionalProperties false) ----------
const S = (props) => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });
// Length and count limits are deliberately NOT in the schema: Groq validates the model's output against the
// schema after generation and answers 400 (json_validate_failed) if a string runs a few characters long, which
// throws away a good answer. We trim and range-check on the server instead (see reconcile* and validate*).
// Limits on counts are not in the schema either. We first tried keeping maxItems on the arrays keyed by the engine's
// risk keys, but Groq still answered 400 whenever the model listed one extra item (it returned 6 issues for a
// 4-issue contract). The server keeps only the engine's keys and ignores extras.
const arr = (items) => ({ type: 'array', items }); // no maxItems anywhere: Groq answers 400 if the model lists one item too many, so the server slices instead
const text = () => ({ type: 'string' });

export function schemaFor(task, engineRiskKeys = []) {
  if (task === 'deal') {
    const keyProp = { type: 'string' }; // not an enum: the model sometimes lists extra items; the server keeps only the engine's keys
    return S({
      headline: text(240),
      fair_low: { type: 'integer' },
      fair_high: { type: 'integer' },
      indicative: { type: 'integer' },
      confidence: { type: 'string', enum: ['High', 'Medium', 'Low'] },
      evidence_tier: { type: 'integer', enum: [1, 2, 3] },
      evidence_count: { type: 'integer' },
      drivers: arr(S({ label: text(80), amount: { type: 'integer' }, group: { type: 'string', enum: ['content', 'rights', 'finance'] } }), 8), // finance = payment-terms adjustment
      risks: arr(S({ key: keyProp, name: text(80), severity: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] }, consequence: text(260) })), // no item limit: the server keeps only the engine's keys and ignores extras
      unknowns: arr(text(200), 6),
      counter_amount: { type: 'integer' },
    });
  }
  if (task === 'contract') {
    const keyProp = { type: 'string' }; // not an enum: the model sometimes lists extra items; the server keeps only the engine's keys
    return S({
      issues: arr(S({ key: keyProp, reading: text(280), consequence: text(320), suggestion: text(240) })),
      missing: arr(S({ term: text(80), why: text(220) }), 6),
      escalate: { type: 'boolean' },
    });
  }
  if (task === 'negotiate') return S({ draft: text(1700), trades: arr(text(160), 5) });
  if (task === 'autopsy') {
    return S({ confidence: { type: 'string', enum: ['INSUFFICIENT EVIDENCE', 'LOW'] }, answer: text(600), observed: arr(text(160), 5), hypotheses: arr(text(200), 3) });
  }
  return S({ summary: text(240), narrow: arr(text(200), 5) }); // checker
}

// ---------- evidence integrity: every rupee figure in model text must come from the engine or the user's own text ----------
// "Verifier rejects uncited figures". A figure is cited if it is an engine number (offer, range, counter, a priced line,
// an unpriced ask, a pricing weight) or appears in the message or contract the creator supplied. Anything else is dropped.
const FIG = /(?:₹|rs\.?\s*|inr\s*)\s*(\d[\d,]*(?:\.\d+)?)\s*(k|l|lakhs?|crore|cr)?\b|\b(\d[\d,]*(?:\.\d+)?)\s*(rupees|rs)\b/gi;
export function figuresIn(text) {
  const out = [];
  for (const m of String(text || '').matchAll(FIG)) {
    let n = parseFloat((m[1] || m[3]).replace(/,/g, ''));
    const u = (m[2] || '').toLowerCase();
    if (u === 'k') n *= 1e3; else if (u === 'l' || u.startsWith('lakh')) n *= 1e5; else if (u === 'crore' || u === 'cr') n *= 1e7;
    if (Number.isFinite(n)) out.push(Math.round(n));
  }
  return out;
}
const WEIGHTS = [38000, 22000, 18000, 3000, 10000, 6000, 2000, 1500, 15000, 4000, 1000];
export function allowedFigures(E, sourceText, extra = []) {
  const s = new Set();
  const add = (n) => { if (Number.isFinite(n)) s.add(Math.round(Math.abs(n))); };
  if (E) {
    [E.ask, E.indicative, E.low, E.high, E.productValue].forEach(add);
    if (E.counter) [E.counter.max, E.counter.rel, E.counter.pres].forEach(add);
    (E.lines || []).forEach((l) => add(l.amount));
    (E.unpriced || []).forEach((u) => add(u.amount));
    if (E.lockout) add(E.lockout.amount);
  }
  WEIGHTS.forEach(add);
  extra.forEach(add);
  figuresIn(sourceText).forEach(add);
  return s;
}
export const uncited = (text, allowed) => (allowed ? figuresIn(text).filter((n) => !allowed.has(n)) : []);

// ---------- reconciliation: engine numbers always win ----------
const RANK = { High: 3, Medium: 2, Low: 1 };
const okText = (v, lo, hi) => typeof v === 'string' && v.trim().length >= lo && v.length <= hi;
const lowerConf = (a, b) => (RANK[b] && RANK[b] < RANK[a] ? b : a);
const uniq = (list) => { const seen = new Set(); return list.filter((x) => { const k = x.toLowerCase().slice(0, 30); if (seen.has(k)) return false; seen.add(k); return true; }); };

// The headline is the first thing a creator reads. When the engine has decided what the headline issue is (the
// licence, barter, or a very low engagement rate), a model headline is only accepted if it still leads with it.
function headlineKeepsPriority(E, text) {
  const top = (E.risks[0] || {}).key;
  if (E.T && E.T.barter) return /barter|product/i.test(text);
  if (E.lockout) return /exclusiv/i.test(text) && text.includes(E.lockout.amount.toLocaleString('en-IN')); // names the lockout and its price
  if (top === 'perpetual') return /licen[cs]e/i.test(text); // the product's point: the licence, not the fee, is the issue
  if (top === 'engagement') return /engagement/i.test(text);
  return true;
}

export function reconcileDeal(E, m, allowed) {
  const unavailable = Boolean(E.rangeUnavailable) || E.low == null;
  const adjusted = !unavailable && (m.fair_low !== E.low || m.fair_high !== E.high || m.indicative !== E.indicative || m.counter_amount !== (E.counter && E.counter.max));
  let rejected = 0;
  const clean = (text, engineText) => { if (uncited(text, allowed).length) { rejected++; return engineText; } return text; };
  const risks = E.risks.map((r) => {
    const x = (m.risks || []).find((y) => y && y.key === r.key);
    return { key: r.key, name: r.title, severity: r.sev, consequence: x && okText(x.consequence, 15, 320) ? clean(x.consequence.trim(), r.consequence) : r.consequence, line: r.line };
  });
  const modelUnknowns = (Array.isArray(m.unknowns) ? m.unknowns : []).filter((u) => okText(u, 8, 200)).filter((u) => { if (uncited(u, allowed).length) { rejected++; return false; } return true; });
  return {
    headline: okText(m.headline, 10, 260) && headlineKeepsPriority(E, m.headline) ? clean(m.headline.trim(), E.headline) : E.headline,
    fair_low: unavailable ? null : E.low,
    fair_high: unavailable ? null : E.high,
    indicative: unavailable ? null : E.indicative,
    ask: E.ask,
    range_unavailable: unavailable ? E.rangeUnavailable || 'Not enough information to range this offer.' : null,
    confidence: lowerConf(E.confidence, m.confidence),
    evidence_tier: E.evidence.tier,
    evidence_count: E.evidence.count,
    evidence_text: E.evidence.text,
    drivers: E.lines.map((l) => ({ label: l.label, amount: l.amount, group: l.group })),
    unpriced: E.unpriced,
    risks,
    unknowns: uniq([...E.unknown, ...modelUnknowns]).slice(0, 7),
    counter_amount: E.counter && E.counter.max ? E.counter.max : null,
    numbers_adjusted: adjusted,
    numbers_note: adjusted ? 'numbers checked by CreVa engine' : null,
    verifier: { rejected }, // model text dropped because it contained a rupee figure nobody supplied
  };
}

export function reconcileContract(E, m, contractText, missingFn, allowed) {
  let rejected = 0;
  const pick = (text, lo, hi, engineText) => {
    if (!okText(text, lo, hi)) return engineText;
    if (uncited(text, allowed).length) { rejected++; return engineText; }
    return text.trim();
  };
  const issues = E.risks.map((r) => {
    const x = (m.issues || []).find((y) => y && y.key === r.key) || {};
    return {
      key: r.key,
      title: r.title,
      severity: r.sev,
      clause: r.clause,
      quote: r.quote,
      value: r.value || '',
      reading: pick(x.reading, 10, 300, r.reading),
      consequence: pick(x.consequence, 10, 340, r.consequence),
      suggestion: pick(x.suggestion, 10, 260, r.suggestion),
    };
  });
  const engineMissing = missingFn(contractText);
  const modelMissing = Array.isArray(m.missing) ? m.missing.filter((x) => x && okText(x.term, 3, 80) && okText(x.why, 8, 220)).filter((x) => { if (uncited(x.term + ' ' + x.why, allowed).length) { rejected++; return false; } return true; }).slice(0, 6) : [];
  return { issues, missing: modelMissing.length ? modelMissing : engineMissing, escalate: Boolean(E.escalate || m.escalate), escalate_why: E.escalateWhy || [], tax_note: Boolean(E.taxNote), issue_count: issues.length, verifier: { rejected } };
}

// Causal or blame language is refused: with this little data CreVa may describe, never explain.
const BLAME = /\bbecause\b|due to|caused by|the algorithm|shadow ?ban|your hook|audience fatigue|did not resonate|didn't resonate|lack of interest|(likely|probably) (contributed|caused|led)|led to|resulted in|contributed to/i;
export function validateAutopsy(ctxMetrics, m) {
  const rule = ctxMetrics.ret3 <= -20 ? 'hyp' : 'ins';
  const hypText = Array.isArray(m.hypotheses) ? m.hypotheses.join(' ') : '';
  if (!okText(m.answer, 30, 700) || BLAME.test(m.answer) || BLAME.test(hypText) || !Array.isArray(m.observed) || !m.observed.length) return null;
  if (figuresIn(m.answer + ' ' + hypText + ' ' + m.observed.join(' ')).length) return null; // an autopsy has no rupee figures to cite
  if (rule === 'ins') {
    if (m.confidence !== 'INSUFFICIENT EVIDENCE' || (Array.isArray(m.hypotheses) && m.hypotheses.length)) return null;
  } else if (m.confidence !== 'LOW' || !/can'?t|cannot|unable|not establish|not proven/i.test(m.answer)) return null;
  return {
    kind: rule,
    confidence: m.confidence,
    answer: m.answer.trim(),
    observed: m.observed.slice(0, 5).map(String),
    hypotheses: rule === 'ins' ? [] : (m.hypotheses || []).slice(0, 3).map(String),
  };
}

const SENT = /\b(i have sent|i've sent|i sent|i have accepted|i've accepted|i accepted|i have signed|i've signed)\b/i;
export function validateDraft(m, price, inr, disclosure, sourceText = '', allowed = null) {
  if (!okText(m.draft, 80, 1800) || SENT.test(m.draft)) return null;
  if (uncited(m.draft + ' ' + (Array.isArray(m.trades) ? m.trades.join(' ') : ''), allowed).length) return null; // an invented figure in a message the creator may send
  // Faithfulness guard: revisions are a number of rounds. "Unlimited revisions/rounds" would exaggerate the contract
  // unless the source text itself says so. (Saying the scope of each round is uncapped is accurate and allowed.)
  if (/unlimited\s+(revision|round)/i.test(m.draft) && !/unlimited\s+(revision|round)/i.test(sourceText)) return null;
  const digits = inr(price).replace('₹', '');
  if (!m.draft.includes(digits)) return null;
  let draft = m.draft.trim();
  if (!/paid partnership/i.test(draft)) draft += '\n\n' + disclosure;
  return { draft, trades: Array.isArray(m.trades) ? m.trades.filter((t) => okText(t, 4, 160)).slice(0, 5) : [] };
}
