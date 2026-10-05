import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { aggregateChannels, entryTypeForChannel, type ProviderConfig } from './src/aggregate.js';
import { renderPage } from './src/page.js';
import { bindHost, originAfterListen } from '@open-channel/server';

const dir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8780);
const host = bindHost();

function loadProviders(): ProviderConfig[] {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, '..', 'providers.json'), 'utf8')) as ProviderConfig[];
  const envMap: Record<string, string | undefined> = {
    chat: process.env.OCP_CHAT_URL,
    tasks: process.env.OCP_TASKS_URL,
    notes: process.env.OCP_NOTES_URL,
  };
  return raw.map((p) => ({
    ...p,
    baseUrl: envMap[p.id] ?? p.baseUrl,
  }));
}

const providers = loadProviders();

function providerById(id: string): ProviderConfig | undefined {
  return providers.find((p) => p.id === id);
}

async function proxyJson(p: ProviderConfig, pathname: string, method = 'GET', body?: unknown) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${p.token}`,
    Accept: 'application/vnd.ocp+json',
  };
  let payload: string | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${p.baseUrl.replace(/\/$/, '')}${pathname}`, { method, headers, body: payload });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderPage());
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/channels') {
      const data = await aggregateChannels(providers, { q: url.searchParams.get('q') ?? undefined });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    const detailMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/([^/]+)$/);
    if (detailMatch && req.method === 'GET') {
      const p = providerById(detailMatch[1]!);
      if (!p) {
        res.writeHead(404);
        res.end('{}');
        return;
      }
      const channelId = detailMatch[2]!;
      const discovery = await proxyJson(p, '/v1');
      const caps = (discovery.body as { capabilities: Record<string, boolean> }).capabilities;
      const channelRes = await proxyJson(p, `/v1/channels/${channelId}`);
      const entriesRes = caps.entries ? await proxyJson(p, `/v1/channels/${channelId}/entries`) : null;
      const linksRes = caps.links ? await proxyJson(p, `/v1/channels/${channelId}/links`) : null;
      let linksInParent: { data: unknown[] } | null = null;
      if (caps.links) {
        const inbound = await proxyJson(p, `/v1/channels/${channelId}/links?direction=in&type=parent`);
        const rows = ((inbound.body as { data?: { source_id: string; type: string; title?: string }[] })?.data ??
          []) as { source_id: string; type: string; title?: string }[];
        const labeled = [];
        for (const l of rows) {
          const src = await proxyJson(p, `/v1/channels/${l.source_id}`);
          labeled.push({
            ...l,
            label: (src.body as { title?: string })?.title ?? l.source_id,
          });
        }
        linksInParent = { data: labeled };
      }
      const revisionsRes = caps.revisions ? await proxyJson(p, `/v1/channels/${channelId}/revisions`) : null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          capabilities: caps,
          channel: channelRes.body,
          entries: entriesRes?.body ?? null,
          links: linksRes?.body ?? null,
          linksInParent,
          revisions: revisionsRes?.body ?? null,
        }),
      );
      return;
    }

    const entryPost = url.pathname.match(/^\/api\/channels\/([^/]+)\/([^/]+)\/entries$/);
    if (entryPost && req.method === 'POST') {
      const p = providerById(entryPost[1]!);
      const channelId = entryPost[2]!;
      const raw = await readBody(req);
      const { text } = JSON.parse(raw) as { text: string };
      const chRes = await proxyJson(p!, `/v1/channels/${channelId}`);
      const chType = (chRes.body as { type: string }).type;
      const body = {
        type: entryTypeForChannel(chType),
        body: [{ type: 'text', text, format: 'plain' }],
        parent_id: null,
        anchor: null,
      };
      const created = await proxyJson(p!, `/v1/channels/${channelId}/entries`, 'POST', body);
      res.writeHead(created.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(created.body));
      return;
    }

    const sharePost = url.pathname.match(/^\/api\/channels\/([^/]+)\/([^/]+)\/shares$/);
    if (sharePost && req.method === 'POST') {
      const p = providerById(sharePost[1]!);
      const channelId = sharePost[2]!;
      const created = await proxyJson(p!, `/v1/channels/${channelId}/shares`, 'POST', {
        scope: 'view',
        expires_at: null,
      });
      res.writeHead(created.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(created.body));
      return;
    }

    const restorePost = url.pathname.match(/^\/api\/channels\/([^/]+)\/([^/]+)\/revisions\/([^/]+)\/restore$/);
    if (restorePost && req.method === 'POST') {
      const p = providerById(restorePost[1]!);
      const channelId = restorePost[2]!;
      const revId = restorePost[3]!;
      const restored = await proxyJson(p!, `/v1/channels/${channelId}/revisions/${revId}/restore`, 'POST', {});
      res.writeHead(restored.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(restored.body));
      return;
    }

    const fileProxy = url.pathname.match(/^\/api\/files\/([^/]+)\/([^/]+)$/);
    if (fileProxy && (req.method === 'GET' || req.method === 'HEAD')) {
      const p = providerById(fileProxy[1]!);
      const fileId = fileProxy[2]!;
      const headers: Record<string, string> = { Authorization: `Bearer ${p!.token}` };
      const range = req.headers.range;
      if (range) headers.Range = Array.isArray(range) ? range[0]! : range;
      const upstream = await fetch(`${p!.baseUrl.replace(/\/$/, '')}/v1/files/${fileId}`, {
        method: req.method,
        headers,
      });
      const out: Record<string, string> = {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      };
      const fileName = upstream.headers.get('x-file-name');
      if (fileName) out['X-File-Name'] = fileName;
      const acceptRanges = upstream.headers.get('accept-ranges');
      if (acceptRanges) out['Accept-Ranges'] = acceptRanges;
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) out['Content-Range'] = contentRange;
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) out['Content-Length'] = contentLength;
      if (req.method === 'HEAD') {
        res.writeHead(upstream.status, out);
        res.end();
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, out);
      res.end(buf);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end('Error');
  }
});

server.listen(port, host, () => {
  const addr = server.address();
  const p = typeof addr === 'object' && addr ? addr.port : port;
  console.log(`console ${originAfterListen(host, p)}`);
});
