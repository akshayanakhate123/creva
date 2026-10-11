// npm test: syntax-checks the inline app script, builds the page, and verifies the output.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(process.env.CHECK_FILE || path.join(root, 'counter.html'), 'utf8');
let failed = false;
const ok = (name, pass, note = '') => { console.log((pass ? 'PASS ' : 'FAIL ') + name + (note ? ' - ' + note : '')); if (!pass) failed = true; };

const start = html.indexOf('<script>'), end = html.lastIndexOf('</script>');
ok('counter.html has an inline script', start > -1 && end > start);
try {
  const js = html.slice(start + 8, end).replace(/\nrender\(\);[\s\S]*$/, '\n');
  new Function(js);
  ok('inline script parses', true);
} catch (e) { ok('inline script parses', false, e.message); }

const b = spawnSync(process.execPath, [path.join(root, 'scripts', 'build.js')], { encoding: 'utf8' });
ok('build runs', b.status === 0, (b.stdout || b.stderr || '').trim());
const out = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
ok('public/index.html has doctype', out.toLowerCase().startsWith('<!doctype html>'));
ok('title is in <head>', /<head>[\s\S]*<title>CreVa<\/title>[\s\S]*<\/head>/.test(out));
ok('no secret-looking strings in the page', !/gsk_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/.test(out));
// Lint: model output and contract text are untrusted. Any template interpolation that touches one of these
// fields must go through esc() before it can reach innerHTML. This is a heuristic guard, not a proof.
{
  const script = html.slice(start + 8, end);
  const UNTRUSTED = /(headline|consequence|reading|suggestion|\.answer|narrowAI|S\.msg|S\.con\b|\.observed|\.hyp\b|\.unknown\b|\.unknowns|\.why\b|\.term\b|\.quote|\.line\b|S\.draft\b|S\.chaseDraft|S\.instr\b|\.summary)/;
  const bad = [];
  for (let i = script.indexOf('${'); i !== -1; i = script.indexOf('${', i + 2)) {
    let depth = 1, j = i + 2;
    while (j < script.length && depth > 0) { const ch = script[j]; if (ch === '{') depth++; else if (ch === '}') depth--; j++; }
    // Ignore literal text and .length: only code that reads an untrusted field matters.
    const expr = script.slice(i + 2, j - 1).replace(/'[^']*'|`[^`$]*`/g, "''").replace(/[A-Za-z0-9_.]+\.length\b/g, '0');
    if (UNTRUSTED.test(expr) && !/esc\(/.test(expr) && !/\$\{/.test(expr)) {
      bad.push(script.slice(0, i).split('\n').length + ': ' + expr.slice(0, 70).replace(/\s+/g, ' '));
    }
  }
  ok('untrusted fields are escaped before reaching innerHTML', bad.length === 0, bad.length ? bad.slice(0, 8).join(' | ') : '');
  ok('no eval or document.write in the page', !/\beval\(|document\.write\(/.test(script));
}

const g = spawnSync(process.execPath, [path.join(root, 'scripts', 'gen-engine.js'), '--check'], { encoding: 'utf8' });
ok('lib/engine.js and lib/system.js match counter.html', g.status === 0, (g.stdout || '').trim().replace(/\r?\n/g, '; '));
const t = spawnSync(process.execPath, [path.join(root, 'scripts', 'test-ai-offline.js')], { encoding: 'utf8' });
ok('/api/ai offline guardrail tests', t.status === 0, t.status === 0 ? '' : (t.stdout || t.stderr || '').trim().slice(-500));
for (const [label, file] of [['spec guardrails: escalation, confidence caps, lockout, correlation, uncited figures', 'test-engine.js'], ['screens show what the spec promises', 'test-ui-spec.js'], ['deals, rate card, invoices, reminders, plans, photo persistence', 'test-build.js'],['GlowSkin numbers are consistent on every screen', 'audit-consistency.js'], ['failure paths show an honest label and the app still works', 'failure-tests.js'], ['no secrets in the working tree or git history', 'scan-secrets.js']]) {
  const x = spawnSync(process.execPath, [path.join(root, 'scripts', file)], { encoding: 'utf8', timeout: 180000 });
  const lastLine = (x.stdout || '').trim().split('\n').filter(Boolean).pop() || '';
  ok(label, x.status === 0, x.status === 0 ? lastLine : (x.stdout || x.stderr || '').trim().slice(-500));
}
const d = spawnSync(process.execPath, [path.join(root, 'scripts', 'test-data-offline.js')], { encoding: 'utf8' });
ok('/api/data offline validation tests', d.status === 0, d.status === 0 ? '' : (d.stdout || d.stderr || '').trim().slice(-600));
process.exit(failed ? 1 : 0);
