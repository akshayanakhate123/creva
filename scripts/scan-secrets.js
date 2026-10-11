// Looks for secrets in the working tree and in the full git history, WITHOUT printing any secret.
//   1. every non-empty value in .env.local (read here, never printed)
//   2. known key shapes: Groq (gsk_), JWT-like tokens (legacy Supabase keys), sb_secret_, postgres URLs with passwords
//   3. extra strings you pass in SCAN_EXTRA (comma separated), for example a password you pasted somewhere
// Reports only WHERE something matched (file or commit), never WHAT. Exits 1 if anything is found.
// Run: node scripts/scan-secrets.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 400 * 1024 * 1024 });

const literals = [];
const envFile = path.join(root, '.env.local');
if (fs.existsSync(envFile)) {
  for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || l.trim().startsWith('#')) continue;
    const v = m[2].replace(/^["']|["']$/g, '');
    // short non-secret values (like a model name) are not secrets; URLs are checked below as identifiers
    if (v.length >= 20 && !/^openai\//.test(v)) literals.push([m[1], v]);
    if (m[1] === 'SUPABASE_URL') { const ref = (v.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1]; if (ref) literals.push(['project ref', ref]); }
  }
}
for (const x of (process.env.SCAN_EXTRA || '').split(',').map((s) => s.trim()).filter(Boolean)) literals.push(['SCAN_EXTRA value', x]);

const SHAPES = [
  ['Groq key shape (gsk_...)', /gsk_[A-Za-z0-9]{20,}/],
  ['JWT-like token (legacy Supabase key shape)', /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['Supabase secret key shape (sb_secret_...)', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['Postgres URL with a password', /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@/],
];

function scanText(text) {
  const hits = [];
  for (const [name, v] of literals) if (text.includes(v)) hits.push(name);
  for (const [name, re] of SHAPES) if (re.test(text)) hits.push(name);
  return [...new Set(hits)];
}

let problems = 0;
const report = (where, hits) => { problems += hits.length; console.log('FOUND  ' + where + '  <- ' + hits.join(', ')); };

// 1) working tree: tracked files plus untracked files that are not ignored
const files = [...git(['ls-files']).stdout.split('\n'), ...git(['ls-files', '--others', '--exclude-standard']).stdout.split('\n')].filter(Boolean);
let scanned = 0;
for (const f of files) {
  const p = path.join(root, f);
  let buf; try { buf = fs.readFileSync(p); } catch { continue; }
  if (buf.length > 5_000_000 || buf.includes(0)) continue;
  scanned++;
  const hits = scanText(buf.toString('utf8'));
  if (hits.length) report('working tree: ' + f, hits);
}
console.log(`Working tree: scanned ${scanned} files (tracked + untracked-not-ignored).`);

// 2) git history: every commit's patch
const logRes = git(['log', '--all', '-p', '--no-color', '--format=@@COMMIT %H']);
if (logRes.status !== 0) { console.log('Could not read git history: ' + (logRes.stderr || '').slice(0, 120)); process.exit(2); }
let commits = 0;
for (const chunk of logRes.stdout.split('@@COMMIT ').slice(1)) {
  commits++;
  const sha = chunk.slice(0, 40);
  const hits = scanText(chunk);
  if (hits.length) report('history: commit ' + sha.slice(0, 10), hits);
}
console.log(`History: scanned ${commits} commits.`);

// 3) was an env file ever committed?
const envEver = git(['log', '--all', '--name-only', '--format=', '--', '.env', '.env.local', '.env.production', '.env.development']).stdout.trim();
console.log(envEver ? 'FOUND  an env file appears in history: ' + envEver.split('\n')[0] : 'No .env or .env.local file was ever committed.');
if (envEver) problems++;
const tracked = git(['ls-files', '.env.local']).stdout.trim();
console.log(tracked ? 'FOUND  .env.local is tracked by git' : '.env.local is not tracked.');
if (tracked) problems++;
const ignored = git(['check-ignore', '.env.local']).status === 0;
console.log(ignored ? '.env.local is ignored by .gitignore.' : 'FOUND  .env.local is NOT ignored');
if (!ignored) problems++;

console.log(`\nChecked ${literals.length} literal values and ${SHAPES.length} key shapes. ` + (problems ? problems + ' problem(s) found.' : 'Nothing found.'));
process.exit(problems ? 1 : 0);
