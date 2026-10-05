import http from 'node:http';
import { randomBytes } from 'node:crypto';

const port = Number(process.env.PORT ?? 8784);
const host = process.env.HOST === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1';
const TOKEN = 'demo-token';
const OCP_JSON = 'application/vnd.ocp+json; charset=utf-8';
const PROBLEM_JSON = 'application/problem+json';

const capabilities = {
  body: false,
  entries: true,
  entry_threads: false,
  links: true,
  shares: false,
  revisions: false,
};

type Entry = {
  id: string;
  channel_id: string;
  type: string;
  body: { type: string; text: string; format: string }[];
  parent_id: null;
  anchor: null;
  author: { id: string; display_name: string };
  created_at: string;
  deleted_at: null;
};

type Link = {
  id: string;
  type: string;
  source_id: string;
  target_id?: string;
  target_url?: string;
  title?: string;
  created_at: string;
  deleted_at: null;
};

const actor = { id: 'u_fuse', display_name: '融合台' };
const now = '2026-01-01T00:00:00.000Z';

const channel = {
  id: 'ch_accept',
  type: 'task',
  title: '验收清单',
  body: [],
  capabilities,
  members: [{ id: 'u_fuse', display_name: '融合台', role: 'owner' as const }],
  ext: { native_id: 'T-100' },
  created_at: now,
  updated_at: now,
  deleted_at: null,
  revision: null,
};

const entries: Entry[] = [
  {
    id: 'en_accept_1',
    channel_id: 'ch_accept',
    type: 'comment',
    body: [{ type: 'text', text: '先对协议再写适配。', format: 'plain' }],
    parent_id: null,
    anchor: null,
    author: { id: 'u_fuse', display_name: '融合台' },
    created_at: now,
    deleted_at: null,
  },
];

const links: Link[] = [];

function genId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

function problem(code: string, status: number, extra?: Record<string, unknown>) {
  return {
    type: `urn:ocp:problem:${code.replace(/_/g, '-')}`,
    title: code,
    status,
    code,
    ...extra,
  };
}

function sendJson(res: http.ServerResponse, status: number, body: unknown, type = OCP_JSON) {
  const raw = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(raw) });
  res.end(raw);
}

function sendProblem(res: http.ServerResponse, code: string, status: number, extra?: Record<string, unknown>) {
  sendJson(res, status, problem(code, status, extra), PROBLEM_JSON);
}

function tokensEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

function authorized(req: http.IncomingMessage): boolean {
  const h = req.headers.authorization ?? '';
  const m = /^Bearer (.+)$/.exec(h);
  return Boolean(m && tokensEqual(m[1]!, TOKEN));
}

function isAbsoluteHttpUrl(s: string): boolean {
  if (!/^https?:\/\/\S+$/.test(s)) return false;
  try {
    const u = new URL(s);
    return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.host);
  } catch {
    return false;
  }
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const method = req.method ?? 'GET';
  const path = url.pathname;

  try {
    if (method === 'GET' && path === '/v1') {
      sendJson(res, 200, {
        protocol: 'ocp',
        version: '1',
        provider: { id: 'native', name: '工单适配' },
        actor,
        capabilities,
      });
      return;
    }

    const publicPath =
      path === '/v1' || path === '/v1/sessions' || path.startsWith('/s/');
    if (!publicPath && !authorized(req)) {
      sendProblem(res, 'unauthorized', 401);
      return;
    }

    if (method === 'GET' && path === '/v1/channels') {
      sendJson(res, 200, { data: [channel], next_cursor: null });
      return;
    }

    const chMatch = path.match(/^\/v1\/channels\/([^/]+)(?:\/(entries|links|revisions|shares))?$/);
    if (chMatch) {
      const chId = chMatch[1]!;
      const sub = chMatch[2];
      if (chId !== 'ch_accept') {
        sendProblem(res, 'not_found', 404);
        return;
      }
      if (!sub && method === 'GET') {
        sendJson(res, 200, channel);
        return;
      }
      if (sub === 'revisions' || sub === 'shares') {
        sendProblem(res, 'capability_unsupported', 404, { capability: sub });
        return;
      }
      if (sub === 'entries' && method === 'GET') {
        sendJson(res, 200, { data: entries, next_cursor: null });
        return;
      }
      if (sub === 'entries' && method === 'POST') {
        const raw = await readBody(req);
        let o: Record<string, unknown>;
        try {
          o = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          sendProblem(res, 'validation_error', 400);
          return;
        }
        if (o.id !== undefined || o.author !== undefined) {
          sendProblem(res, 'validation_error', 400);
          return;
        }
        if (o.type !== 'comment' && o.type !== 'message' && o.type !== 'annotation') {
          sendProblem(res, 'validation_error', 400);
          return;
        }
        const body = o.body as { type: string; text: string; format?: string }[] | undefined;
        if (!Array.isArray(body) || !body[0] || body[0].type !== 'text' || !body[0].text) {
          sendProblem(res, 'validation_error', 400);
          return;
        }
        const entry: Entry = {
          id: genId('en'),
          channel_id: chId,
          type: String(o.type),
          body: [{ type: 'text', text: body[0].text, format: body[0].format ?? 'plain' }],
          parent_id: null,
          anchor: null,
          author: { ...actor },
          created_at: new Date().toISOString(),
          deleted_at: null,
        };
        entries.push(entry);
        sendJson(res, 201, entry);
        return;
      }
      if (sub === 'links' && method === 'GET') {
        sendJson(res, 200, { data: links.filter((l) => !l.deleted_at), next_cursor: null });
        return;
      }
      if (sub === 'links' && method === 'POST') {
        const raw = await readBody(req);
        let o: Record<string, unknown>;
        try {
          o = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          sendProblem(res, 'validation_error', 400);
          return;
        }
        if (o.id !== undefined) {
          sendProblem(res, 'validation_error', 400);
          return;
        }
        const hasTarget = o.target_id !== undefined;
        const hasUrl = o.target_url !== undefined;
        if (hasTarget === hasUrl) {
          sendProblem(res, 'validation_error', 400);
          return;
        }
        if (hasTarget && o.target_id !== 'ch_accept') {
          sendProblem(res, 'validation_error', 400);
          return;
        }
        if (hasUrl && (typeof o.target_url !== 'string' || !isAbsoluteHttpUrl(o.target_url))) {
          sendProblem(res, 'validation_error', 400);
          return;
        }
        if (typeof o.type !== 'string') {
          sendProblem(res, 'validation_error', 400);
          return;
        }
        const link: Link = {
          id: genId('ln'),
          type: o.type,
          source_id: chId,
          target_id: hasTarget ? String(o.target_id) : undefined,
          target_url: hasUrl ? String(o.target_url) : undefined,
          title: typeof o.title === 'string' ? o.title : undefined,
          created_at: new Date().toISOString(),
          deleted_at: null,
        };
        links.push(link);
        sendJson(res, 201, link);
        return;
      }
    }

    const entryGet = path.match(/^\/v1\/entries\/([^/]+)$/);
    if (entryGet && method === 'GET') {
      const row = entries.find((e) => e.id === entryGet[1]);
      if (!row) {
        sendProblem(res, 'not_found', 404);
        return;
      }
      sendJson(res, 200, row);
      return;
    }

    const linkDel = path.match(/^\/v1\/links\/([^/]+)$/);
    if (linkDel && method === 'DELETE') {
      const row = links.find((l) => l.id === linkDel[1] && !l.deleted_at);
      if (!row) {
        sendProblem(res, 'not_found', 404);
        return;
      }
      (row as { deleted_at: string }).deleted_at = new Date().toISOString();
      sendJson(res, 200, row);
      return;
    }

    sendProblem(res, 'not_found', 404);
  } catch (err) {
    console.error(err);
    sendProblem(res, 'validation_error', 400);
  }
});

server.listen(port, host, () => {
  const addr = server.address();
  const p = typeof addr === 'object' && addr ? addr.port : port;
  const advertised = host === '0.0.0.0' ? '127.0.0.1' : host;
  console.log(`native provider http://${advertised}:${p}`);
});
