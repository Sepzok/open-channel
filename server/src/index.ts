import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Store, createChannelRecord, updateChannelBody } from './store.js';
import { problem, type ProblemCode } from './problems.js';
import type { AppOptions, Block, Entry, Link } from './types.js';
import {
  OCP_JSON,
  PROBLEM_JSON,
  assertOnlyKeys,
  blockTextContent,
  genId,
  genShareToken,
  isResourceId,
  isTypeName,
  nowIso,
  parseJsonBody,
  sha256,
  titleValid,
  tokensEqual,
  trimTitle,
  wantsShareJson,
} from './util.js';
import { sharePageHtml } from './html.js';

type IdempotencyRecord = { hash: string; status: number; body: string };

export function createApp(options: AppOptions): http.Server {
  const store = new Store(options);
  const idempotency = new Map<string, IdempotencyRecord>();
  const maxFileBytes = options.maxFileBytes ?? 5 * 1024 * 1024;
  let ready = store.init();

  function sendJson(res: ServerResponse, status: number, body: unknown, contentType = OCP_JSON): void {
    res.writeHead(status, { 'Content-Type': contentType });
    res.end(JSON.stringify(body));
  }

  function sendResult(res: ServerResponse, status: number, body: unknown): void {
    const isProblem =
      body !== null && typeof body === 'object' && 'code' in (body as object) && 'type' in (body as object);
    sendJson(res, status, body, isProblem ? PROBLEM_JSON : OCP_JSON);
  }

  function sendProblem(res: ServerResponse, code: ProblemCode, extra?: Record<string, unknown>): void {
    const p = problem(code, extra as Parameters<typeof problem>[1]);
    sendJson(res, p.status, p, PROBLEM_JSON);
  }

  function checkVersion(req: IncomingMessage, res: ServerResponse): boolean {
    const v = req.headers['ocp-version'];
    if (v !== undefined && v !== '1') {
      sendProblem(res, 'unsupported_version');
      return false;
    }
    return true;
  }

  function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) {
      sendProblem(res, 'unauthorized');
      return false;
    }
    const token = h.slice(7);
    if (!tokensEqual(token, options.token)) {
      sendProblem(res, 'unauthorized');
      return false;
    }
    return true;
  }

  async function readBody(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  function shareActive(share: { revoked_at: string | null; expires_at: string | null }): boolean {
    if (share.revoked_at) return false;
    if (share.expires_at && share.expires_at <= nowIso()) return false;
    return true;
  }

  function findShareByToken(token: string) {
    return Object.values(store.data.shares).find((s) => s.token === token);
  }

  function blocksHaveFile(blocks: Block[], fileId: string): boolean {
    return blocks.some((b) => b.type === 'file' && b.file.id === fileId);
  }

  function channelReferencesFile(channelId: string, fileId: string): boolean {
    const ch = store.getChannel(channelId);
    if (!ch) return false;
    if (blocksHaveFile(ch.body, fileId)) return true;
    for (const en of Object.values(store.data.entries)) {
      if (en.channel_id !== channelId || en.deleted_at) continue;
      if (blocksHaveFile(en.body, fileId)) return true;
    }
    return false;
  }

  function pageById<T extends { id: string }>(
    items: T[],
    limit: number,
    cursor: string | null,
  ): { data: T[]; next_cursor: string | null } {
    let start = 0;
    if (cursor) {
      try {
        const c = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as { id: string };
        const idx = items.findIndex((x) => x.id === c.id);
        if (idx >= 0) start = idx + 1;
      } catch {
        /* ignore bad cursor */
      }
    }
    const slice = items.slice(start, start + limit);
    const next =
      start + limit < items.length && slice.length > 0
        ? Buffer.from(JSON.stringify({ id: slice[slice.length - 1]!.id }), 'utf8').toString('base64url')
        : null;
    return { data: slice, next_cursor: next };
  }

  function parseBlocksFromRequest(raw: unknown, allowNoIds = true): { ok: true; blocks: Block[] } | { ok: false; code: ProblemCode; capability?: string } {
    if (!Array.isArray(raw)) return { ok: false, code: 'validation_error' };
    const blocks: Block[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') return { ok: false, code: 'validation_error' };
      const o = item as Record<string, unknown>;
      if (o.id !== undefined) {
        if (!allowNoIds) return { ok: false, code: 'validation_error' };
        if (typeof o.id !== 'string' || !isResourceId(o.id)) return { ok: false, code: 'validation_error' };
      } else if (!allowNoIds && 'id' in o) {
        return { ok: false, code: 'validation_error' };
      }
      if (o.type === 'text') {
        if (typeof o.text !== 'string') return { ok: false, code: 'validation_error' };
        const format = o.format === undefined ? 'plain' : o.format;
        if (format !== 'plain' && format !== 'markdown') return { ok: false, code: 'validation_error' };
        blocks.push({
          id: (o.id as string) ?? '',
          type: 'text',
          text: o.text,
          format,
        });
      } else if (o.type === 'file') {
        const file = o.file as Record<string, unknown>;
        if (!file || typeof file.id !== 'string') return { ok: false, code: 'validation_error' };
        blocks.push({
          id: (o.id as string) ?? '',
          type: 'file',
          file: { id: file.id as string, name: '', media_type: '', size: 0 },
        });
      } else if (o.type === 'embed') {
        const embed = o.embed as Record<string, unknown>;
        if (!embed || typeof embed.url !== 'string' || typeof embed.title !== 'string') {
          return { ok: false, code: 'validation_error' };
        }
        blocks.push({
          id: (o.id as string) ?? '',
          type: 'embed',
          embed: { url: embed.url, title: embed.title },
        });
      } else {
        return { ok: false, code: 'validation_error' };
      }
    }
    const assigned = store.assignBlockIds(blocks, allowNoIds && blocks.some((b) => b.id));
    const err = store.validateBodyBlocks(assigned);
    if (err === 'file_not_found') return { ok: false, code: 'file_not_found' };
    if (err) return { ok: false, code: 'validation_error' };
    return { ok: true, blocks: store.syncFileBlocks(assigned) };
  }

  async function handleIdempotent(
    req: IncomingMessage,
    res: ServerResponse,
    rawBody: string,
    handler: () => { status: number; body: unknown },
  ): Promise<void> {
    const outcome = await store.runExclusive(() => {
      const key = req.headers['idempotency-key'];
      const useKey = typeof key === 'string' && key.length >= 1 && key.length <= 128;
      if (!useKey) {
        return { kind: 'fresh' as const, ...handler() };
      }
      const hash = sha256(rawBody);
      const existing = idempotency.get(key);
      if (existing) {
        if (existing.hash !== hash) return { kind: 'conflict' as const };
        return { kind: 'replay' as const, status: existing.status, body: existing.body };
      }
      const result = handler();
      idempotency.set(key, { hash, status: result.status, body: JSON.stringify(result.body) });
      return { kind: 'fresh' as const, status: result.status, body: result.body };
    });
    if (outcome.kind === 'conflict') {
      sendProblem(res, 'idempotency_conflict');
      return;
    }
    if (outcome.kind === 'replay') {
      const ct = outcome.status >= 400 ? PROBLEM_JSON : OCP_JSON;
      res.writeHead(outcome.status, { 'Content-Type': ct });
      res.end(outcome.body);
      return;
    }
    sendResult(res, outcome.status, outcome.body);
  }

  const server = http.createServer(async (req, res) => {
    await ready;
    if (!checkVersion(req, res)) return;

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    const method = req.method ?? 'GET';
    const pathname = url.pathname;

    try {
      // GET /v1
      if (method === 'GET' && pathname === '/v1') {
        sendJson(res, 200, {
          protocol: 'ocp',
          version: '1',
          provider: { id: options.providerId, name: options.providerName },
          actor: options.actor,
          capabilities: options.capabilities,
        });
        return;
      }

      // Share routes
      const shareMatch = pathname.match(/^\/s\/([^/]+)(\/entries|\/files\/([^/]+))?$/);
      if (shareMatch) {
        const token = shareMatch[1]!;
        const sub = shareMatch[2];
        const share = findShareByToken(token);
        if (!share || !shareActive(share)) {
          sendProblem(res, 'share_unavailable');
          return;
        }
        const ch = store.getChannel(share.channel_id);
        if (!ch) {
          sendProblem(res, 'share_unavailable');
          return;
        }

        if (method === 'GET' && !sub) {
          if (wantsShareJson(req.headers.accept)) {
            const entries = Object.values(store.data.entries)
              .filter((e) => e.channel_id === ch.id && e.deleted_at === null)
              .sort((a, b) => a.created_at.localeCompare(b.created_at))
              .map((e) => ({
                id: e.id,
                type: e.type,
                body: e.body,
                parent_id: e.parent_id,
                anchor: e.anchor,
                author: e.author,
                created_at: e.created_at,
              }));
            sendJson(res, 200, {
              share: { scope: share.scope, expires_at: share.expires_at },
              channel: {
                id: ch.id,
                type: ch.type,
                title: ch.title,
                body: ch.body,
                updated_at: ch.updated_at,
              },
              entries,
            });
          } else {
            const entries = Object.values(store.data.entries).filter((e) => e.channel_id === ch.id);
            const html = sharePageHtml({
              channel: ch,
              entries,
              share,
              publicOrigin: options.publicOrigin,
            });
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
          }
          return;
        }

        if (method === 'GET' && sub?.startsWith('/files/')) {
          const fileId = shareMatch[3]!;
          if (!channelReferencesFile(ch.id, fileId)) {
            sendProblem(res, 'not_found');
            return;
          }
          const meta = store.data.files[fileId];
          if (!meta) {
            sendProblem(res, 'not_found');
            return;
          }
          const bytes = fs.readFileSync(path.join(store.filesDir, fileId));
          res.writeHead(200, {
            'Content-Type': meta.media_type,
            'X-File-Name': encodeURIComponent(meta.name),
          });
          res.end(bytes);
          return;
        }

        if (method === 'POST' && sub === '/entries') {
          if (share.scope === 'view') {
            sendProblem(res, 'share_forbidden');
            return;
          }
          const raw = (await readBody(req)).toString('utf8');
          const parsed = parseJsonBody(raw);
          if (!parsed.ok) {
            sendProblem(res, 'validation_error');
            return;
          }
          const bodyObj = parsed.value as Record<string, unknown>;
          const unk = assertOnlyKeys(bodyObj, ['body']);
          if (unk) {
            sendProblem(res, 'validation_error', { errors: [{ path: '', message: unk }] });
            return;
          }
          const blocksResult = parseBlocksFromRequest(bodyObj.body, false);
          if (!blocksResult.ok) {
            sendProblem(res, blocksResult.code);
            return;
          }
          if (blocksResult.blocks.length < 1) {
            sendProblem(res, 'validation_error');
            return;
          }
          const entryType = ['dm', 'group', 'room'].includes(ch.type) ? 'message' : 'comment';
          const result = await store.runExclusive(() => {
            const ts = nowIso();
            const entry: Entry = {
              id: genId('en'),
              channel_id: ch.id,
              type: entryType,
              body: blocksResult.blocks,
              parent_id: null,
              anchor: null,
              author: { id: 'share', display_name: '访客' },
              created_at: ts,
              updated_at: ts,
              deleted_at: null,
            };
            store.data.entries[entry.id] = entry;
            ch.updated_at = ts;
            store.persistSync();
            return entry;
          });
          sendJson(res, 201, result);
          return;
        }

        sendProblem(res, 'not_found');
        return;
      }

      if (!checkAuth(req, res)) return;

      // Files
      if (pathname === '/v1/files' && method === 'POST') {
        const buf = await readBody(req);
        if (buf.length > maxFileBytes) {
          sendProblem(res, 'file_too_large');
          return;
        }
        const nameHeader = req.headers['x-file-name'];
        const name = nameHeader ? decodeURIComponent(String(nameHeader)) : 'file';
        const mediaType = req.headers['content-type'] ?? 'application/octet-stream';
        const result = await store.runExclusive(() => {
          const id = genId('file');
          const meta = { id, name, media_type: String(mediaType), size: buf.length };
          store.data.files[id] = meta;
          fs.writeFileSync(path.join(store.filesDir, id), buf);
          store.persistSync();
          return meta;
        });
        sendJson(res, 201, result);
        return;
      }

      const fileGet = pathname.match(/^\/v1\/files\/([^/]+)$/);
      if (fileGet && method === 'GET') {
        const meta = store.data.files[fileGet[1]!];
        if (!meta) {
          sendProblem(res, 'not_found');
          return;
        }
        const bytes = fs.readFileSync(path.join(store.filesDir, fileGet[1]!));
        res.writeHead(200, {
          'Content-Type': meta.media_type,
          'X-File-Name': encodeURIComponent(meta.name),
        });
        res.end(bytes);
        return;
      }

      // Channels list
      if (pathname === '/v1/channels' && method === 'GET') {
        const limitRaw = url.searchParams.get('limit');
        let limit = limitRaw ? parseInt(limitRaw, 10) : 50;
        if (Number.isNaN(limit) || limit < 1) limit = 50;
        if (limit > 100) {
          sendProblem(res, 'validation_error', { errors: [{ path: 'limit', message: 'max 100' }] });
          return;
        }
        const result = store.listChannels({
          type: url.searchParams.get('type') ?? undefined,
          updated_since: url.searchParams.get('updated_since') ?? undefined,
          include_deleted: url.searchParams.get('include_deleted') === 'true',
          order: (url.searchParams.get('order') as 'updated' | 'created') ?? 'updated',
          limit,
          cursor: url.searchParams.get('cursor') ?? undefined,
        });
        sendJson(res, 200, result);
        return;
      }

      if (pathname === '/v1/channels' && method === 'POST') {
        const raw = (await readBody(req)).toString('utf8');
        await handleIdempotent(req, res, raw, () => {
          const parsed = parseJsonBody(raw);
          if (!parsed.ok) {
            return { status: 400, body: problem('validation_error') };
          }
          const o = parsed.value as Record<string, unknown>;
          if (o.id !== undefined) {
            return { status: 400, body: problem('validation_error') };
          }
          const unk = assertOnlyKeys(o, ['type', 'title', 'body', 'members', 'ext']);
          if (unk) return { status: 400, body: problem('validation_error', { errors: [{ path: '', message: unk }] }) };
          if (typeof o.type !== 'string' || !isTypeName(o.type)) {
            return { status: 400, body: problem('validation_error') };
          }
          if (typeof o.title !== 'string' || !titleValid(o.title)) {
            return { status: 400, body: problem('validation_error') };
          }
          const bodyArr = o.body;
          if (bodyArr !== undefined) {
            if (!options.capabilities.body) {
              if (Array.isArray(bodyArr) && bodyArr.length > 0) {
                return { status: 404, body: problem('capability_unsupported', { capability: 'body' }) };
              }
            }
          }
          let blocks: Block[] = [];
          if (options.capabilities.body && bodyArr !== undefined) {
            const br = parseBlocksFromRequest(bodyArr, false);
            if (!br.ok) {
              const status = br.code === 'file_not_found' ? 400 : br.code === 'capability_unsupported' ? 404 : 400;
              return { status, body: problem(br.code, br.capability ? { capability: br.capability } : undefined) };
            }
            blocks = br.blocks;
          }
          let members;
          if (o.members !== undefined) {
            if (!Array.isArray(o.members)) return { status: 400, body: problem('validation_error') };
            members = o.members as { id: string; display_name: string; role: string }[];
          }
          const ch = createChannelRecord(
            store,
            { type: o.type, title: o.title, body: blocks, members, ext: o.ext as Record<string, string> },
            options.actor,
          );
          store.persistSync();
          return { status: 201, body: store.publicChannel(ch) };
        });
        return;
      }

      const chMatch = pathname.match(/^\/v1\/channels\/([^/]+)$/);
      if (chMatch) {
        const chId = chMatch[1]!;
        const ch = store.getChannel(chId);
        if (!ch) {
          sendProblem(res, 'not_found');
          return;
        }
        if (method === 'GET') {
          sendJson(res, 200, store.publicChannel(ch));
          return;
        }
        if (method === 'DELETE') {
          const updated = await store.runExclusive(() => {
            ch.deleted_at = nowIso();
            ch.updated_at = ch.deleted_at;
            store.persistSync();
            return ch;
          });
          sendJson(res, 200, store.publicChannel(updated));
          return;
        }
        if (method === 'PATCH') {
          const raw = (await readBody(req)).toString('utf8');
          const parsed = parseJsonBody(raw);
          if (!parsed.ok) {
            sendProblem(res, 'validation_error');
            return;
          }
          const o = parsed.value as Record<string, unknown>;
          const unk = assertOnlyKeys(o, ['title', 'body', 'members', 'ext', 'base_revision']);
          if (unk) {
            sendProblem(res, 'validation_error', { errors: [{ path: '', message: unk }] });
            return;
          }
          if (!('title' in o) && !('body' in o) && !('members' in o) && !('ext' in o)) {
            sendProblem(res, 'validation_error');
            return;
          }
          if (o.body !== undefined && !options.capabilities.body) {
            sendProblem(res, 'capability_unsupported', { capability: 'body' });
            return;
          }
          const touchesRevision = o.title !== undefined || o.body !== undefined;
          if (touchesRevision && options.capabilities.revisions && o.base_revision === undefined) {
            sendProblem(res, 'validation_error', { errors: [{ path: 'base_revision', message: 'required' }] });
            return;
          }
          const result = await store.runExclusive(() => {
            if (ch.deleted_at) return { error: 'deleted' as const };
            if (touchesRevision && options.capabilities.revisions && o.base_revision !== ch.revision) {
              return { error: 'conflict' as const, current: ch.revision };
            }
            if (o.title !== undefined) {
              if (typeof o.title !== 'string' || !titleValid(o.title)) {
                return { error: 'validation_error' as const };
              }
              ch.title = trimTitle(o.title);
            }
            if (o.body !== undefined) {
              const br = parseBlocksFromRequest(o.body, false);
              if (!br.ok) return { error: br.code };
              ch.body = br.blocks;
            }
            if (o.members !== undefined) {
              ch.members = o.members as typeof ch.members;
            }
            if (o.ext !== undefined) {
              ch.ext = o.ext as Record<string, string>;
            }
            ch.updated_at = nowIso();
            if (touchesRevision && options.capabilities.revisions) {
              store.addRevision(ch, options.actor);
            }
            store.persistSync();
            return { channel: ch };
          });
          if ('error' in result) {
            if (result.error === 'conflict') {
              sendProblem(res, 'conflict', { current_revision: result.current ?? undefined });
              return;
            }
            sendProblem(res, result.error as ProblemCode);
            return;
          }
          sendJson(res, 200, store.publicChannel(result.channel!));
          return;
        }
      }

      // Entries under channel
      const entList = pathname.match(/^\/v1\/channels\/([^/]+)\/entries$/);
      if (entList) {
        const chId = entList[1]!;
        const ch = store.getChannel(chId);
        if (!ch) {
          sendProblem(res, 'not_found');
          return;
        }
        if (!options.capabilities.entries) {
          sendProblem(res, 'capability_unsupported', { capability: 'entries' });
          return;
        }
        if (method === 'GET') {
          const includeDeleted = url.searchParams.get('include_deleted') === 'true';
          let items = Object.values(store.data.entries).filter((e) => e.channel_id === chId);
          if (!includeDeleted) items = items.filter((e) => e.deleted_at === null);
          const parentId = url.searchParams.get('parent_id');
          if (url.searchParams.has('parent_id')) {
            items = items.filter((e) => e.parent_id === parentId);
          }
          const order = url.searchParams.get('order') === 'desc' ? 'desc' : 'asc';
          items.sort((a, b) => {
            const cmp = a.created_at.localeCompare(b.created_at);
            if (cmp !== 0) return order === 'desc' ? -cmp : cmp;
            return a.id.localeCompare(b.id);
          });
          const limitRaw = url.searchParams.get('limit');
          let limit = limitRaw ? parseInt(limitRaw, 10) : 50;
          if (Number.isNaN(limit) || limit < 1) limit = 50;
          if (limit > 100) {
            sendProblem(res, 'validation_error');
            return;
          }
          sendJson(res, 200, pageById(items, limit, url.searchParams.get('cursor')));
          return;
        }
        if (method === 'POST') {
          const raw = (await readBody(req)).toString('utf8');
          await handleIdempotent(req, res, raw, () => {
            if (ch.deleted_at) return { status: 409, body: problem('deleted') };
            const parsed = parseJsonBody(raw);
            if (!parsed.ok) return { status: 400, body: problem('validation_error') };
            const o = parsed.value as Record<string, unknown>;
            if (o.id !== undefined || o.author !== undefined) {
              return { status: 400, body: problem('validation_error') };
            }
            const unk = assertOnlyKeys(o, ['type', 'body', 'parent_id', 'anchor', 'ext']);
            if (unk) return { status: 400, body: problem('validation_error') };
            if (typeof o.type !== 'string' || !isTypeName(o.type)) {
              return { status: 400, body: problem('validation_error') };
            }
            const br = parseBlocksFromRequest(o.body, false);
            if (!br.ok) return { status: 400, body: problem(br.code) };
            if (br.blocks.length < 1) return { status: 400, body: problem('validation_error') };
            if (o.parent_id !== undefined && o.parent_id !== null) {
              if (!options.capabilities.entry_threads) {
                return { status: 400, body: problem('threads_unsupported') };
              }
              const parent = store.data.entries[o.parent_id as string];
              if (!parent || parent.channel_id !== chId || parent.deleted_at) {
                return { status: 400, body: problem('validation_error') };
              }
            }
            if (o.anchor !== undefined && o.anchor !== null) {
              if (!options.capabilities.body) {
                return { status: 400, body: problem('anchor_unsupported') };
              }
              const anchor = o.anchor as { block_id: string };
              const blockIds = new Set(ch.body.map((b) => b.id));
              if (!blockIds.has(anchor.block_id)) {
                return { status: 400, body: problem('anchor_unsupported') };
              }
            }
            const ts = nowIso();
            const entry: Entry = {
              id: genId('en'),
              channel_id: chId,
              type: o.type,
              body: br.blocks,
              parent_id: (o.parent_id as string | null) ?? null,
              anchor: (o.anchor as Entry['anchor']) ?? null,
              author: options.actor,
              ext: o.ext as Record<string, string> | undefined,
              created_at: ts,
              updated_at: ts,
              deleted_at: null,
            };
            store.data.entries[entry.id] = entry;
            ch.updated_at = ts;
            store.persistSync();
            return { status: 201, body: entry };
          });
          return;
        }
      }

      const entOne = pathname.match(/^\/v1\/entries\/([^/]+)$/);
      if (entOne) {
        const entry = store.data.entries[entOne[1]!];
        if (!entry) {
          sendProblem(res, 'not_found');
          return;
        }
        if (method === 'GET') {
          sendJson(res, 200, entry);
          return;
        }
        if (method === 'DELETE') {
          const updated = await store.runExclusive(() => {
            entry.deleted_at = nowIso();
            entry.updated_at = entry.deleted_at;
            const ch = store.getChannel(entry.channel_id);
            if (ch) ch.updated_at = entry.deleted_at;
            store.persistSync();
            return entry;
          });
          sendJson(res, 200, updated);
          return;
        }
      }

      // Links
      const linkList = pathname.match(/^\/v1\/channels\/([^/]+)\/links$/);
      if (linkList) {
        const chId = linkList[1]!;
        const ch = store.getChannel(chId);
        if (!ch) {
          sendProblem(res, 'not_found');
          return;
        }
        if (!options.capabilities.links) {
          sendProblem(res, 'capability_unsupported', { capability: 'links' });
          return;
        }
        if (method === 'GET') {
          const direction = url.searchParams.get('direction') ?? 'out';
          const includeDeleted = url.searchParams.get('include_deleted') === 'true';
          let items = Object.values(store.data.links);
          if (!includeDeleted) items = items.filter((l) => l.deleted_at === null);
          if (direction === 'out') {
            items = items.filter((l) => l.source_id === chId);
          } else if (direction === 'in') {
            items = items.filter((l) => l.target_id === chId);
          } else {
            items = items.filter((l) => l.source_id === chId || l.target_id === chId);
          }
          items.sort((a, b) => a.id.localeCompare(b.id));
          const limitRaw = url.searchParams.get('limit');
          let limit = limitRaw ? parseInt(limitRaw, 10) : 50;
          if (Number.isNaN(limit) || limit < 1) limit = 50;
          if (limit > 100) {
            sendProblem(res, 'validation_error');
            return;
          }
          sendJson(res, 200, pageById(items, limit, url.searchParams.get('cursor')));
          return;
        }
        if (method === 'POST') {
          const raw = (await readBody(req)).toString('utf8');
          await handleIdempotent(req, res, raw, () => {
            const parsed = parseJsonBody(raw);
            if (!parsed.ok) return { status: 400, body: problem('validation_error') };
            const o = parsed.value as Record<string, unknown>;
            if (o.id !== undefined) return { status: 400, body: problem('validation_error') };
            const unk = assertOnlyKeys(o, ['type', 'target_id', 'target_url', 'title', 'ext']);
            if (unk) return { status: 400, body: problem('validation_error') };
            if (typeof o.type !== 'string' || !isTypeName(o.type)) {
              return { status: 400, body: problem('validation_error') };
            }
            const hasTarget = o.target_id !== undefined;
            const hasUrl = o.target_url !== undefined;
            if (hasTarget === hasUrl) return { status: 400, body: problem('validation_error') };
            if (hasTarget) {
              const target = store.getChannel(o.target_id as string);
              if (!target || target.deleted_at) {
                return { status: 400, body: problem('validation_error') };
              }
            }
            const link: Link = {
              id: genId('ln'),
              type: o.type,
              source_id: chId,
              target_id: hasTarget ? (o.target_id as string) : undefined,
              target_url: hasUrl ? (o.target_url as string) : undefined,
              title: o.title as string | undefined,
              ext: o.ext as Record<string, string> | undefined,
              created_at: nowIso(),
              deleted_at: null,
            };
            store.data.links[link.id] = link;
            store.persistSync();
            return { status: 201, body: link };
          });
          return;
        }
      }

      const linkDel = pathname.match(/^\/v1\/links\/([^/]+)$/);
      if (linkDel && method === 'DELETE') {
        const link = store.data.links[linkDel[1]!];
        if (!link) {
          sendProblem(res, 'not_found');
          return;
        }
        const updated = await store.runExclusive(() => {
          link.deleted_at = nowIso();
          store.persistSync();
          return link;
        });
        sendJson(res, 200, updated);
        return;
      }

      // Shares
      const shareCreate = pathname.match(/^\/v1\/channels\/([^/]+)\/shares$/);
      if (shareCreate && method === 'POST') {
        const ch = store.getChannel(shareCreate[1]!);
        if (!ch) {
          sendProblem(res, 'not_found');
          return;
        }
        if (!options.capabilities.shares) {
          sendProblem(res, 'capability_unsupported', { capability: 'shares' });
          return;
        }
        const raw = (await readBody(req)).toString('utf8');
        await handleIdempotent(req, res, raw, () => {
          const parsed = parseJsonBody(raw);
          if (!parsed.ok) return { status: 400, body: problem('validation_error') };
          const o = parsed.value as Record<string, unknown>;
          const unk = assertOnlyKeys(o, ['scope', 'expires_at']);
          if (unk) return { status: 400, body: problem('validation_error') };
          if (o.scope !== 'view' && o.scope !== 'comment') {
            return { status: 400, body: problem('validation_error') };
          }
          if (o.expires_at !== undefined && o.expires_at !== null) {
            if (typeof o.expires_at !== 'string' || o.expires_at <= nowIso()) {
              return { status: 400, body: problem('validation_error') };
            }
          }
          const token = genShareToken();
          const share = {
            id: genId('sh'),
            channel_id: ch.id,
            token,
            scope: o.scope as 'view' | 'comment',
            url: `${options.publicOrigin}/s/${token}`,
            expires_at: (o.expires_at as string | null) ?? null,
            created_at: nowIso(),
            revoked_at: null,
          };
          store.data.shares[share.id] = share;
          store.persistSync();
          return { status: 201, body: share };
        });
        return;
      }

      const shareGet = pathname.match(/^\/v1\/shares\/([^/]+)$/);
      if (shareGet) {
        const share = store.data.shares[shareGet[1]!];
        if (!share) {
          sendProblem(res, 'not_found');
          return;
        }
        if (method === 'GET') {
          sendJson(res, 200, share);
          return;
        }
        if (method === 'DELETE') {
          const updated = await store.runExclusive(() => {
            share.revoked_at = nowIso();
            store.persistSync();
            return share;
          });
          sendJson(res, 200, updated);
          return;
        }
      }

      // Revisions
      const revList = pathname.match(/^\/v1\/channels\/([^/]+)\/revisions$/);
      if (revList && method === 'GET') {
        const ch = store.getChannel(revList[1]!);
        if (!ch) {
          sendProblem(res, 'not_found');
          return;
        }
        if (!options.capabilities.revisions) {
          sendProblem(res, 'capability_unsupported', { capability: 'revisions' });
          return;
        }
        const items = Object.values(store.data.revisions)
          .filter((r) => r.channel_id === ch.id)
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        sendJson(res, 200, { data: items, next_cursor: null });
        return;
      }

      const revGet = pathname.match(/^\/v1\/channels\/([^/]+)\/revisions\/([^/]+)$/);
      if (revGet) {
        const ch = store.getChannel(revGet[1]!);
        if (!ch) {
          sendProblem(res, 'not_found');
          return;
        }
        if (!options.capabilities.revisions) {
          sendProblem(res, 'capability_unsupported', { capability: 'revisions' });
          return;
        }
        const rev = store.data.revisions[revGet[2]!];
        if (!rev || rev.channel_id !== ch.id) {
          sendProblem(res, 'not_found');
          return;
        }
        if (method === 'GET') {
          sendJson(res, 200, rev);
          return;
        }
      }

      const revRestore = pathname.match(/^\/v1\/channels\/([^/]+)\/revisions\/([^/]+)\/restore$/);
      if (revRestore && method === 'POST') {
        const ch = store.getChannel(revRestore[1]!);
        if (!ch) {
          sendProblem(res, 'not_found');
          return;
        }
        if (!options.capabilities.revisions) {
          sendProblem(res, 'capability_unsupported', { capability: 'revisions' });
          return;
        }
        const rev = store.data.revisions[revRestore[2]!];
        if (!rev || rev.channel_id !== ch.id) {
          sendProblem(res, 'not_found');
          return;
        }
        const updated = await store.runExclusive(() => {
          ch.title = rev.title;
          ch.body = JSON.parse(JSON.stringify(rev.body)) as Block[];
          ch.updated_at = nowIso();
          store.addRevision(ch, options.actor);
          store.persistSync();
          return ch;
        });
        sendJson(res, 200, store.publicChannel(updated));
        return;
      }

      sendProblem(res, 'not_found');
    } catch (err) {
      console.error(err);
      sendProblem(res, 'validation_error');
    }
  });

  return server;
}

export type { AppOptions, Capabilities, Seed } from './types.js';
