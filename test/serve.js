// Tiny static server for the visual harness.  node test/serve.js  → http://localhost:8765/test/harness.html
// /test/harness-sjis.html serves the same page declared + transmitted as Shift_JIS, to
// prove the injected UI renders correctly inside a legacy-encoded host document.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8765;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/test/harness.html';
  const sjis = rel === '/test/harness-sjis.html';
  if (sjis) rel = '/test/harness.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  const ext = path.extname(file);
  let body = fs.readFileSync(file);
  let type = TYPES[ext] || 'application/octet-stream';
  if (ext === '.html' && sjis) {
    // harness.html is pure ASCII by design, so re-labelling the bytes is lossless.
    body = Buffer.from(body.toString('latin1').replace('<meta charset="UTF-8">', '<meta charset="Shift_JIS">'), 'latin1');
    type += '; charset=Shift_JIS';
  } else if (ext === '.html' || ext === '.js') {
    type += '; charset=utf-8';
  }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}).listen(PORT, () => console.log(`harness: http://localhost:${PORT}/test/harness.html`));
