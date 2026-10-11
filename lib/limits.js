// Best-effort abuse protection. HONEST LIMITS: the per-IP counter lives in this serverless instance's memory.
// Vercel may run several instances and recycles them, so it is NOT a hard guarantee. The daily cap is
// counted in the database (analyses table) when Supabase is configured, which is shared across instances.
const hits = new Map(); // ip -> array of timestamps (ms)

export function clientIp(request) {
  const xff = request.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0].trim();
  return first || 'unknown';
}

export function ipLimited(ip, max = 10, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(ip, arr);
    return Math.ceil((windowMs - (now - arr[0])) / 1000);
  }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return 0;
}

// In-memory fallback for the daily cap when the database is unavailable.
let memDay = '';
let memCount = 0;
export function memDaily(limit) {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== memDay) { memDay = day; memCount = 0; }
  if (memCount >= limit) return true;
  memCount += 1;
  return false;
}
