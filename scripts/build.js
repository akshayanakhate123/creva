// Generates public/index.html from counter.html. counter.html stays the single source of truth.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wrap } from '../lib/wrap.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'counter.html');
const outDir = path.join(root, 'public');

const html = fs.readFileSync(src, 'utf8');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), wrap(html));
console.log('Built public/index.html (' + Math.round(wrap(html).length / 1024) + ' KB) from counter.html');
