// Prints the live-versus-fallback counts behind the spec's "fallback rate" metric (last 30 days).
// Usage: node scripts/metrics.js [https://your-site.vercel.app]   (default http://localhost:5173)
const BASE = (process.argv[2] || process.env.BASE || 'http://localhost:5173').replace(/\/$/, '');
const res = await fetch(BASE + '/api/data?kind=metrics');
const d = await res.json().catch(() => null);
if (!d || !d.ok) { console.log('metrics not available:', d && d.code, 'HTTP', res.status); process.exit(1); }
console.log(`Last ${d.windowDays} days: ${d.live} live, ${d.fallback} fallback, fallback rate ${d.fallbackRate == null ? 'n/a' : d.fallbackRate + '%'}`);
for (const [task, v] of Object.entries(d.byTask)) console.log(`  ${task.padEnd(10)} live ${v.live}  fallback ${v.fallback}`);
console.log('Guardrail answers that never reach the model (refusals and similar) are not counted.');
