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
    value: { task, brand: str(body.brand, MAX_BRAND), message: message.slice(0, MAX_MESSAGE), contract, contractTruncated, mode: body.mode || null, ctx },
  };
}

// ---------- JSON schemas (strict mode: every property required, additionalProperties false) ----------
const S = (props) => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });
const arr = (items, max) => ({ type: 'array', items, maxItems: max });
const text = (max) => ({ type: 'string', maxLength: max });

export function schemaFor(task, engineRiskKeys = []) {
  if (task === 'deal') {
    const keyProp = engineRiskKeys.length ? { type: 'string', enum: engineRiskKeys } : { type: 'string' };
    return S({
      headline: text(240),
      fair_low: { type: 'integer' },
      fair_high: { type: 'integer' },
      indicative: { type: 'integer' },
      confidence: { type: 'string', enum: ['High', 'Medium', 'Low'] },
      evidence_tier: { type: 'integer', enum: [1, 2, 3] },
      evidence_count: { type: 'integer' },
      drivers: arr(S({ label: text(80), amount: { type: 'integer' }, group: { type: 'string', enum: ['content', 'rights'] } }), 8),
      risks: arr(S({ key: keyProp, name: text(80), severity: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] }, consequence: text(260) }), engineRiskKeys.length ? engineRiskKeys.length : 0),
      unknowns: arr(text(200), 6),
      counter_amount: { type: 'integer' },
    });
  }
  if (task === 'contract') {
    const keyProp = engineRiskKeys.length ? { type: 'string', enum: engineRiskKeys } : { type: 'string' };
    return S({
      issues: arr(S({ key: keyProp, reading: text(280), consequence: text(320), suggestion: text(240) }), engineRiskKeys.length ? engineRiskKeys.length : 0),
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

// ---------- reconciliation: engine numbers always win ----------
const RANK = { High: 3, Medium: 2, Low: 1 };
const okText = (v, lo, hi) => typeof v === 'string' && v.trim().length >= lo && v.length <= hi;
const lowerConf = (a, b) => (RANK[b] && RANK[b] < RANK[a] ? b : a);
const uniq = (list) => { const seen = new Set(); return list.filter((x) => { const k = x.toLowerCase().slice(0, 30); if (seen.has(k)) return false; seen.add(k); return true; }); };

export function reconcileDeal(E, m) {
  const unavailable = Boolean(E.rangeUnavailable) || E.low == null;
  const adjusted = !unavailable && (m.fair_low !== E.low || m.fair_high !== E.high || m.indicative !== E.indicative || m.counter_amount !== (E.counter && E.counter.max));
  const risks = E.risks.map((r) => {
    const x = (m.risks || []).find((y) => y && y.key === r.key);
    return { key: r.key, name: r.title, severity: r.sev, consequence: x && okText(x.consequence, 15, 320) ? x.consequence.trim() : r.consequence, line: r.line };
  });
  return {
    headline: okText(m.headline, 10, 260) ? m.headline.trim() : E.headline,
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
    unknowns: uniq([...E.unknown, ...(Array.isArray(m.unknowns) ? m.unknowns.filter((u) => okText(u, 8, 200)) : [])]).slice(0, 7),
    counter_amount: E.counter && E.counter.max ? E.counter.max : null,
    numbers_adjusted: adjusted,
    numbers_note: adjusted ? 'numbers checked by CreVa engine' : null,
  };
}

export function reconcileContract(E, m, contractText, missingFn) {
  const issues = E.risks.map((r) => {
    const x = (m.issues || []).find((y) => y && y.key === r.key) || {};
    return {
      key: r.key,
      title: r.title,
      severity: r.sev,
      clause: r.clause,
      quote: r.quote,
      reading: okText(x.reading, 10, 300) ? x.reading.trim() : r.reading,
      consequence: okText(x.consequence, 10, 340) ? x.consequence.trim() : r.consequence,
      suggestion: okText(x.suggestion, 10, 260) ? x.suggestion.trim() : r.suggestion,
    };
  });
  const engineMissing = missingFn(contractText);
  const modelMissing = Array.isArray(m.missing) ? m.missing.filter((x) => x && okText(x.term, 3, 80) && okText(x.why, 8, 220)).slice(0, 6) : [];
  return { issues, missing: modelMissing.length ? modelMissing : engineMissing, escalate: Boolean(E.escalate || m.escalate), issue_count: issues.length };
}

const BLAME = /\bbecause\b|due to|caused by|the algorithm|shadow ?ban|your hook|audience fatigue/i;
export function validateAutopsy(ctxMetrics, m) {
  const rule = ctxMetrics.ret3 <= -20 ? 'hyp' : 'ins';
  if (!okText(m.answer, 30, 700) || BLAME.test(m.answer) || !Array.isArray(m.observed) || !m.observed.length) return null;
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
export function validateDraft(m, price, inr, disclosure) {
  if (!okText(m.draft, 80, 1800) || SENT.test(m.draft)) return null;
  const digits = inr(price).replace('₹', '');
  if (!m.draft.includes(digits)) return null;
  let draft = m.draft.trim();
  if (!/paid partnership/i.test(draft)) draft += '\n\n' + disclosure;
  return { draft, trades: Array.isArray(m.trades) ? m.trades.filter((t) => okText(t, 4, 160)).slice(0, 5) : [] };
}
