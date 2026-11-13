// Serverer klienten fra en fast liste over filer. Ingen katalogoppslag og ingen brukerstyrte stier.
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const FILES = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/app.mjs', 'app.mjs'], ['/domain.mjs', 'domain.mjs'], ['/style.css', 'style.css'],
  ['/client/datasource.mjs', 'client/datasource.mjs'], ['/client/local-source.mjs', 'client/local-source.mjs'], ['/client/api-source.mjs', 'client/api-source.mjs'],
]);
const TYPES = { html: 'text/html; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8' };
const HEADERS = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

// dataSource: 'local' (frittstående prototype, sessionStorage) eller 'api' (serverbasert, ingen nettleserlagring).
export function createStaticHandler({ dataSource = 'local' } = {}) {
  if (!['local', 'api'].includes(dataSource)) throw new Error('Ukjent datakilde: ' + dataSource);
  return async function staticHandler(req, res, url) {
    const file = req.method === 'GET' ? FILES.get(url.pathname) : null;
    if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Ikke funnet'); return 404; }
    try {
      let data = await readFile(new URL(file, root));
      if (file === 'index.html') data = data.toString('utf8').replace('<meta name="cp-data-source" content="local">', `<meta name="cp-data-source" content="${dataSource}">`);
      res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[file.split('.').pop()] });
      res.end(data); return 200;
    } catch { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Kunne ikke laste arbeidsflaten'); return 500; }
  };
}
