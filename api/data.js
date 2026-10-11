// /api/data?kind=...   All data for the single demo user ('demo-ananya'), through the Supabase service role.
//   GET  kind=bootstrap -> profile (with photo and plan), opportunities, contracts, deals, payments, recent analyses,
//                          network median, and this month's usage (for plan limits)
//   GET  kind=metrics   -> live versus fallback, the north-star metric and the close rate (last 30 days)
//   POST kind=profile   -> upsert the profile (validated; the downscaled photo travels with it)
//   POST kind=contract  -> upsert a contract by id (validated, capped)
//   POST kind=deal      -> upsert a deal (status, signed/accepted dates, proof checklist, invoice) and its payment row
//   POST kind=share     -> store an ANONYMISED rate-checker result, only with consent (needs supabase/migration-002.sql)
//   POST kind=event     -> record that a fallback happened
//   POST kind=eval      -> insert an eval_runs row
// Errors: { ok:false, code } with code = bad_request | too_large | rate_limited | db_not_configured | db_unavailable | share_unavailable
// The browser never sees the service role key. Supabase JS calls used (all from the official reference):
//   .from(t).select(cols[, {count, head}]).eq(col,v).gte(col,v).order(col,{ascending}).limit(n), .insert(obj), .upsert(obj,{onConflict}).
// NOTE: this is a public single-demo-user prototype: anyone who can open the site can edit the demo data.
// Writes are validated, size-capped, rate-limited per IP and same-origin only. There is no login by design.
import { getSupabase, supabaseConfigured, DEMO_USER } from '../lib/supabase.js';
import { clientIp, ipLimited, sameOrigin } from '../lib/limits.js';
import {
  validateProfile, validateContract, validateEval, validateEvent, validateDeal, validateShare,
  profileFromRow, contractFromRow, analysisFromRow, median, MAX_CONTRACTS, MAX_DEALS, fromDbDealId,
} from '../lib/data.js';

const MAX_BODY = 45_000;
const MAX_PROFILE_BODY = 260_000; // the profile may carry a small photo
const STATUS = { bad_request: 400, too_large: 413, rate_limited: 429, db_not_configured: 503, db_unavailable: 503, share_unavailable: 503 };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const fail = (code, extra = {}) => json({ ok: false, code, ...extra }, STATUS[code] || 500);

class DbError extends Error {}
const must = ({ data, error }) => { if (error) throw new DbError(); return data; };

const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(); };
const isDealTask = (r) => r.result && r.result._task === 'deal' && r.result._reason !== 'test';

async function bootstrap(sb) {
  const [p, c, o, d, pay, a, n, u] = await Promise.all([
    sb.from('profiles').select('*').eq('id', DEMO_USER),
    sb.from('contracts').select('*').eq('user_id', DEMO_USER).order('created_at', { ascending: false }),
    sb.from('opportunities').select('*').eq('user_id', DEMO_USER),
    sb.from('deals').select('*').eq('user_id', DEMO_USER),
    sb.from('payments').select('*'),
    sb.from('analyses').select('id,created_at,source,model,opportunity_id,result').eq('user_id', DEMO_USER).order('created_at', { ascending: false }).limit(20),
    sb.from('network_deals').select('final_amount_inr,is_synthetic').eq('niche', 'career-productivity').eq('band', '10k-100k'),
    sb.from('analyses').select('source,result').eq('user_id', DEMO_USER).gte('created_at', monthStart()).limit(2000),
  ]);
  const net = must(n);
  return {
    ok: true,
    profile: profileFromRow(must(p)[0]),
    opportunities: must(o),
    contracts: must(c).map(contractFromRow),
    deals: must(d).map((r) => ({ ...r, id: fromDbDealId(r.id) })),
    payments: must(pay).map((r) => ({ ...r, deal_id: fromDbDealId(r.deal_id) })),
    analyses: must(a).map(analysisFromRow),
    network: { count: net.length, median: median(net.map((x) => x.final_amount_inr)), synthetic: net.some((x) => x.is_synthetic) },
    usage: { dealAnalyses: must(u).filter(isDealTask).length, monthStart: monthStart() },
  };
}

async function readJson(request, max = MAX_BODY) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > max) return { error: 'too_large' };
  const text = await request.text();
  if (Buffer.byteLength(text) > max) return { error: 'too_large' };
  try { return { value: JSON.parse(text) }; } catch { return { error: 'bad_request' }; }
}

const DB_TIMEOUT_MS = 4000; // a paused or unreachable project must not leave the page waiting

async function metrics(sb) {
  const sinceMs = Date.now() - 30 * 86400_000;
  const since = new Date(sinceMs).toISOString();
  const rows = must(await sb.from('analyses').select('source,result,created_at').eq('user_id', DEMO_USER).gte('created_at', since).order('created_at', { ascending: false }).limit(5000));
  const byTask = {};
  let live = 0, fallback = 0;
  const analysedAt = new Map(); // brand (lowercase) -> earliest analysis time in the window
  for (const r of rows) {
    if (r.result && r.result._reason === 'test') continue; // rows written by tests are not counted
    const task = (r.result && r.result._task) || (r.result && r.result.fair_low != null ? 'deal' : 'other');
    byTask[task] = byTask[task] || { live: 0, fallback: 0 };
    if (r.source === 'live') { live++; byTask[task].live++; } else if (r.source === 'fallback') { fallback++; byTask[task].fallback++; }
    const brand = r.result && r.result._brand ? String(r.result._brand).toLowerCase() : '';
    if (task === 'deal' && brand) { const t = new Date(r.created_at).getTime(); if (!analysedAt.has(brand) || t < analysedAt.get(brand)) analysedAt.set(brand, t); }
  }
  const total = live + fallback;

  // North star: rupee value of deals that were analysed in CreVa and later marked accepted or signed, rolling 30 days.
  // "Later" means the deal was marked on or after the day the brand was first analysed.
  const deals = must(await sb.from('deals').select('brand,closed_amount,terms').eq('user_id', DEMO_USER));
  let value = 0, closed = 0;
  for (const d of deals) {
    const t = d.terms || {};
    const when = t.signedAt || t.acceptedAt;
    if (!when) continue;
    const whenMs = new Date(when + 'T23:59:59Z').getTime();
    if (whenMs < sinceMs) continue;
    const first = analysedAt.get(String(d.brand).toLowerCase());
    if (first == null || new Date(first).toISOString().slice(0, 10) > when) continue;
    closed++; value += d.closed_amount || 0;
  }
  const analysed = analysedAt.size;
  return {
    ok: true, windowDays: 30, live, fallback, fallbackRate: total ? Math.round((fallback / total) * 1000) / 10 : null, byTask,
    northStar: { name: 'CreVa-Assisted Deal Value Closed', valueInr: value, deals: closed },
    closeRate: { analysedBrands: analysed, closed, ratePct: analysed ? Math.round((closed / analysed) * 1000) / 10 : null },
  };
}

async function handle(request, kind, sb) {
  if (request.method === 'GET' && kind === 'bootstrap') return json(await bootstrap(sb));
  if (request.method === 'GET' && kind === 'metrics') return json(await metrics(sb));

  if (request.method === 'POST' && ['profile', 'contract', 'deal', 'share', 'eval', 'event'].includes(kind)) {
    const body = await readJson(request, kind === 'profile' ? MAX_PROFILE_BODY : MAX_BODY);
    if (body.error) return fail(body.error);

    if (kind === 'profile') {
      const v = validateProfile(body.value);
      if (v.error) return fail(v.error);
      must(await sb.from('profiles').upsert(v.value, { onConflict: 'id' }));
      return json({ ok: true });
    }
    if (kind === 'contract') {
      const v = validateContract(body.value);
      if (v.error) return fail(v.error);
      const existing = must(await sb.from('contracts').select('id').eq('user_id', DEMO_USER));
      if (existing.length >= MAX_CONTRACTS && !existing.some((r) => r.id === v.value.id)) return fail('bad_request');
      must(await sb.from('contracts').upsert(v.value, { onConflict: 'id' }));
      return json({ ok: true });
    }
    if (kind === 'deal') {
      const v = validateDeal(body.value);
      if (v.error) return fail(v.error);
      const existing = must(await sb.from('deals').select('id').eq('user_id', DEMO_USER));
      if (existing.length >= MAX_DEALS && !existing.some((r) => r.id === v.value.deal.id)) return fail('bad_request');
      must(await sb.from('deals').upsert(v.value.deal, { onConflict: 'id' }));
      if (v.value.payment) must(await sb.from('payments').upsert(v.value.payment, { onConflict: 'id' }));
      return json({ ok: true });
    }
    if (kind === 'share') {
      const v = validateShare(body.value);
      if (v.error) return fail(v.error);
      const { error } = await sb.from('shared_checks').insert(v.value);
      if (error) return fail('share_unavailable'); // usually: supabase/migration-002.sql has not been run yet
      return json({ ok: true });
    }
    if (kind === 'event') {
      const v = validateEvent(body.value);
      if (v.error) return fail(v.error);
      must(await sb.from('analyses').insert(v.value));
      return json({ ok: true });
    }
    const v = validateEval(body.value);
    if (v.error) return fail(v.error);
    must(await sb.from('eval_runs').insert(v.value));
    return json({ ok: true });
  }
  return fail('bad_request');
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const kind = url.searchParams.get('kind');
    if (!sameOrigin(request)) return fail('bad_request');
    if (ipLimited('data:' + clientIp(request), 60)) return fail('rate_limited');

    if (!supabaseConfigured()) return fail('db_not_configured');
    const sb = getSupabase();

    let timer;
    try {
      return await Promise.race([
        handle(request, kind, sb),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new DbError()), DB_TIMEOUT_MS); }),
      ]);
    } catch {
      // Covers a paused project, a network failure, a timeout, or any database error. Never echo details.
      return fail('db_unavailable');
    } finally {
      clearTimeout(timer);
    }
  },
};
