// counter.html is written as page content (no doctype or head). This wraps it into a complete document.
// Used by both scripts/build.js (deploy) and server.js (local), so there is one source of truth.
const TITLE = /<title>[\s\S]*?<\/title>/;

export function wrap(html) {
  const m = html.match(TITLE);
  const title = m ? m[0] : '<title>CreVa</title>';
  const body = m ? html.replace(TITLE, '') : html;
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    title +
    '<style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style>' +
    '</head><body>' +
    body +
    '</body></html>'
  );
}
