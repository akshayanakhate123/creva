// Reads bootstrap through the running local server and prints row counts. Prints no secrets.
// Start the server first (npm run dev).
const BASE = process.env.BASE || 'http://localhost:5173';
const res = await fetch(BASE + '/api/data?kind=bootstrap');
const d = await res.json();
console.log('HTTP', res.status, '| ok:', d.ok, d.code ? '| code: ' + d.code : '');
if (!d.ok) process.exit(1);
console.log('profile:', d.profile ? d.profile.name + ' | ig ' + d.profile.instagram.followers + ' | li ' + d.profile.linkedin.followers : 'none');
console.log('contracts:', d.contracts.length, '(' + d.contracts.map((c) => c.id).join(', ') + ')');
console.log('opportunities:', d.opportunities.length, '| deals:', d.deals.length, '| payments:', d.payments.length, '| recent analyses:', d.analyses.length);
console.log('network:', JSON.stringify(d.network));
const pass = d.profile && d.contracts.length >= 3 && d.opportunities.length === 3 && d.deals.length === 6 && d.payments.length === 5 && d.network.count === 12 && d.network.median === 54000;
console.log(pass ? 'bootstrap OK' : 'bootstrap does not match the seeded counts');
process.exit(pass ? 0 : 1);
