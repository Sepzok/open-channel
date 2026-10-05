import http from 'node:http';
import { bindHost, originAfterListen, resolveLocale } from '@open-channel/server';
import { renderHubPage } from './page.js';
import { probeTarget, resolveHubTargets } from './targets.js';

const port = Number(process.env.PORT ?? 8779);
const host = bindHost();
const targets = resolveHubTargets();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  const method = req.method ?? 'GET';
  try {
    if ((method === 'GET' || method === 'HEAD') && url.pathname === '/') {
      const locale = resolveLocale({
        queryLang: url.searchParams.get('lang'),
        acceptLanguage: Array.isArray(req.headers['accept-language'])
          ? req.headers['accept-language'][0]
          : req.headers['accept-language'],
      });
      const html = renderHubPage({ locale, targets });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(method === 'HEAD' ? undefined : html);
      return;
    }

    if (method === 'GET' && url.pathname === '/api/status') {
      const rows = await Promise.all(
        targets.map(async (t) => ({ id: t.id, url: t.url, ok: await probeTarget(t.url) })),
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ targets: rows }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ code: 'not_found' }));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ code: 'validation_error' }));
  }
});

server.listen(port, host, () => {
  const addr = server.address();
  const p = typeof addr === 'object' && addr ? addr.port : port;
  console.log(`hub ${originAfterListen(host, p)}`);
});
