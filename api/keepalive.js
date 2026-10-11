// GET /api/keepalive: one tiny database read, so a free Supabase project sees activity and does not pause.
// Called once a day by a Vercel cron job (see vercel.json). Safe to call by hand. Reveals nothing but ok / not ok.
import { getSupabase, supabaseConfigured } from '../lib/supabase.js';
import { clientIp, ipLimited } from '../lib/limits.js';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default {
  async fetch(request) {
    if (request.method !== 'GET') return json({ ok: false, code: 'bad_request' }, 405);
    if (ipLimited('keepalive:' + clientIp(request), 10)) return json({ ok: false, code: 'rate_limited' }, 429);
    if (!supabaseConfigured()) return json({ ok: false, code: 'db_not_configured' }, 503);
    let timer;
    try {
      const sb = getSupabase();
      const res = await Promise.race([
        sb.from('profiles').select('id', { count: 'exact', head: true }),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), 4000); }),
      ]);
      if (res.error) throw new Error('db');
      return json({ ok: true });
    } catch {
      return json({ ok: false, code: 'db_unavailable' }, 503);
    } finally {
      clearTimeout(timer);
    }
  },
};
