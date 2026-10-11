// Loads the real counter.html in jsdom so scripts can render the real screens and run the real front-end code.
// Used by the consistency audit and the failure-path tests. Nothing here touches the network unless the caller's
// fetch bridge does.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { wrap } from '../lib/wrap.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function createApp(fetchImpl) {
  const html = fs.readFileSync(path.join(root, 'counter.html'), 'utf8');
  const dom = new JSDOM(wrap(html), {
    runScripts: 'dangerously',
    url: 'http://localhost:5173/',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = fetchImpl || (() => Promise.reject(new TypeError('network disabled')));
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.localStorage.setItem('creva_tour', '1'); // no first-run tour in tests
    },
  });
  const w = dom.window;
  const api = {
    window: w,
    run: (code) => w.eval(code),                         // run code in the page's scope (S, render, analyze ...)
    text: () => w.document.getElementById('main').textContent.replace(/\s+/g, ' ').trim(),
    count: (sel) => w.document.querySelectorAll(sel).length,
    close: () => w.close(),
  };
  // Let bootstrapData settle (online or offline) before the test starts, so it cannot finish after the window closes.
  for (let i = 0; i < 80 &&w.eval('S.db') === 'unknown'; i++) await new Promise((r) => setTimeout(r, 100));
  return api;
}
