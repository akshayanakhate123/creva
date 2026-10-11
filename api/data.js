// /api/data?kind=...   All data for the single demo user ('demo-ananya'), through the Supabase service role.
//   GET  kind=bootstrap -> profile, opportunities, contracts, deals, payments, recent analyses, network median
//   POST kind=profile   -> upsert the profile (validated)
//   POST kind=contract  -> upsert a contract by id (validated, capped)
//   POST kind=eval      -> insert an eval_runs row
// Errors: { ok:false, code } with code = bad_request | too_large | rate_limited | db_not_configured | db_unavailable
// The browser never sees the service role key. Supabase JS calls used (all from the official reference):
//   .from(t).select(cols[, {count, head}]).eq(col,v).order(col,{ascending}).limit(n), .insert(obj), .upsert(obj,{onConflict}).
// NOTE: this is a public single-demo-user prototype: anyone who can open the site can edit the demo profile.
// Writes are validated, size-capped, rate-limited per IP and same-origin only. There is no login by design.
import { getSupabase, supabaseConfigured, DEMO_USER } from '../lib/supabase.js';
import { clientIp, ipLimited } from '../lib/limits.js';
import { validateProfile, validateContract, validateEval, validateEvent, profileFromRow, contractFromRow, analysisFromRow, median, MAX_CONTRACTS } from '../lib/data.js';

const MAX_BODY = 45_000;
const STATUS = { bad_request: 400, too_large: 413, rate_limited: 429, db_not_configured: 503, db_unavailable: 503 };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const fail = (code, extra = {}) => json({ ok: false, code, ...extra }, STATUS[code] || 500);

class DbError extends Error {}
const must = ({ data, error }) => { if (error) throw new DbError(); return data; };

async function bootstrap(sb) {
  const [p, c, o, d, pay, a, n] = await Promise.all([
    sb.from('profiles').select('*').eq('id', DEMO_USER),
    sb.from('contracts').select('*').eq('user_id', DEMO_USER).order('created_at', { ascending: false }),
    sb.from('opportunities').select('*').eq('user_id', DEMO_USER),
    sb.from('deals').select('*').eq('user_id', DEMO_USER),
    sb.from('payments').select('*'),
    sb.from('analyses').select('id,created_at,source,model,opportunity_id,result').eq('user_id', DEMO_USER).order('created_at', { ascending: false }).limit(20),
    sb.from('network_deals').select('final_amount_inr,is_synthetic').eq('niche', 'career-productivity').eq('band', '10k-100k'),
  ]);
  const net = must(n);
  return {
    ok: true,
    profile: profileFromRow(must(p)[0]),
    opportunities: must(o),
    contracts: must(c).map(contractFromRow),
    deals: must(d),
    payments: must(pay),
    analyses: must(a).map(analysisFromRow),
    network: { count: net.length, median: median(net.map((x) => x.final_amount_inr)), synthetic: net.some((x) => x.is_synthetic) },
  };
}

async function readJson(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return { error: 'too_large' };
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY) return { error: 'too_large' };
  try { return { value: JSON.parse(text) }; } catch { return { error: 'bad_request' }; }
}

const DB_TIMEOUT_MS = 4000; // a paused or unreachable project must not leave the page waiting

async function handle(request, kind, sb) {
  if (request.method === 'GET' && kind === 'bootstrap') return json(await bootstrap(sb));

  if (request.method === 'GET' && kind === 'metrics') {
    // Live versus fallback over the last 30 days. Guardrail answers that never reach the model are not counted.
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const rows = must(await sb.from('analyses').select('source,result').eq('user_id', DEMO_USER).gte('created_at', since).order('created_at', { ascending: false }).limit(5000));
    const byTask = {};
    let live = 0, fallback = 0;
    for (const r of rows) {
      if (r.result && r.result._reason === 'test') continue; // rows written by tests are not counted
      const task = (r.result && r.result._task) || (r.result && r.result.fair_low != null ? 'deal' : 'other');
      byTask[task] = byTask[task] || { live: 0, fallback: 0 };
      if (r.source === 'live') { live++; byTask[task].live++; } else if (r.source === 'fallback') { fallback++; byTask[task].fallback++; }
    }
    const total = live + fallback;
    return json({ ok: true, windowDays: 30, live, fallback, fallbackRate: total ? Math.round((fallback / total) * 1000) / 10 : null, byTask });
  }

  if (request.method === 'POST' && ['profile', 'contract', 'eval', 'event'].includes(kind)) {
    const body = await readJson(request);
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
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return fail('bad_request');
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
