// GET /api/reminders: the daily job behind payment reminders. Run by a Vercel cron job (see vercel.json), safe to call by hand.
// It marks invoices whose due date has passed as 'Overdue', so the reminder appears in the app even if nobody opened it that day.
// CreVa never sends anything to a brand: the reminder is shown to the creator, who copies the chase draft and sends it herself.
// Idempotent. Uses only select and upsert (both in the Supabase JS reference).
import { getSupabase, supabaseConfigured } from '../lib/supabase.js';
import { clientIp, ipLimited } from '../lib/limits.js';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default {
  async fetch(request) {
    if (request.method !== 'GET') return json({ ok: false, code: 'bad_request' }, 405);
    if (ipLimited('reminders:' + clientIp(request), 10)) return json({ ok: false, code: 'rate_limited' }, 429);
    if (!supabaseConfigured()) return json({ ok: false, code: 'db_not_configured' }, 503);
    let timer;
    try {
      const sb = getSupabase();
      const work = (async () => {
        const { data, error } = await sb.from('payments').select('*');
        if (error) throw new Error('db');
        const today = new Date().toISOString().slice(0, 10);
        const due = data.filter((p) => p.due_date && p.due_date < today && (p.received || 0) < (p.invoiced || 0) && ['Invoiced', 'Awaiting payment'].includes(p.status));
        for (const p of due) {
          const r = await sb.from('payments').upsert({ ...p, status: 'Overdue' }, { onConflict: 'id' });
          if (r.error) throw new Error('db');
        }
        return due.length;
      })();
      const marked = await Promise.race([work, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), 4000); })]);
      return json({ ok: true, markedOverdue: marked });
    } catch {
      return json({ ok: false, code: 'db_unavailable' }, 503);
    } finally {
      clearTimeout(timer);
    }
  },
};
