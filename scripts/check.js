// npm test: syntax-checks the inline app script, builds the page, and verifies the output.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'counter.html'), 'utf8');
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
process.exit(failed ? 1 : 0);
