import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CHAT_CAPS,
  NOTES_CAPS,
  TASKS_CAPS,
  ACTOR,
  httpJson,
  loadSeed,
  startServer,
} from './helpers.js';

describe('chat provider mechanisms', () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  before(async () => {
    const s = await startServer({
      providerId: 'chat',
      providerName: '示例会话',
      capabilities: CHAT_CAPS,
      seed: loadSeed('chat'),
      publicOrigin: 'http://127.0.0.1:8781',
    });
    baseUrl = s.baseUrl;
    close = s.close;
  });

  after(async () => {
    await close();
  });

  it('revisions capability unsupported', async () => {
    const ch = (await httpJson(baseUrl, 'GET', '/v1/channels')).body as { data: { id: string }[] };
    const res = await httpJson(baseUrl, 'GET', `/v1/channels/${ch.data[0]!.id}/revisions`);
    assert.equal(res.status, 404);
    const body = res.body as { code: string; capability: string };
    assert.equal(body.code, 'capability_unsupported');
    assert.equal(body.capability, 'revisions');
    assert.equal((body as { data?: unknown }).data, undefined);
  });

  it('PATCH body unsupported on chat', async () => {
    const ch = (await httpJson(baseUrl, 'GET', '/v1/channels')).body as { data: { id: string }[] };
    const res = await httpJson(baseUrl, 'PATCH', `/v1/channels/${ch.data[0]!.id}`, {
      body: { title: 'x', body: [{ type: 'text', text: 'nope', format: 'plain' }] },
    });
    assert.equal(res.status, 404);
    assert.equal((res.body as { code: string }).code, 'capability_unsupported');
  });

  it('entry threads parent filter', async () => {
    const list = await httpJson(baseUrl, 'GET', '/v1/channels/ch_grp_release/entries?parent_id=en_grp_1');
    const data = (list.body as { data: { id: string }[] }).data;
    assert.equal(data.length, 1);
    assert.equal(data[0]!.id, 'en_grp_2');
  });
});

describe('link target_url', () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  before(async () => {
    const s = await startServer({
      providerId: 'notes',
      capabilities: NOTES_CAPS,
      seed: loadSeed('notes'),
    });
    baseUrl = s.baseUrl;
    close = s.close;
  });

  after(async () => {
    await close();
  });

  it('rejects non-http target_url', async () => {
    const res = await httpJson(baseUrl, 'POST', '/v1/channels/ch_draft/links', {
      body: { type: 'references', target_url: 'ftp://x', title: '坏' },
    });
    assert.equal(res.status, 400);
    assert.equal((res.body as { code: string }).code, 'validation_error');
  });
});

describe('notes provider mechanisms', () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  before(async () => {
    const s = await startServer({
      providerId: 'notes',
      providerName: '示例笔记',
      capabilities: NOTES_CAPS,
      seed: loadSeed('notes'),
    });
    baseUrl = s.baseUrl;
    close = s.close;
  });

  after(async () => {
    await close();
  });

  it('seed revisions on 接口草案', async () => {
    const ch = (await httpJson(baseUrl, 'GET', '/v1/channels/ch_draft')).body as {
      revision: string;
      body: { text: string }[];
    };
    const revs = (await httpJson(baseUrl, 'GET', '/v1/channels/ch_draft/revisions')).body as {
      data: { id: string; body: { text: string }[] }[];
    };
    assert.ok(revs.data.length >= 2);
    const first = revs.data[0]!;
    const firstText = first.body.map((b) => (b as { text?: string }).text).join('');
    assert.match(firstText, /频道是可寻址的容器/);
    assert.doesNotMatch(firstText, /外部可打开的地址/);
    const currentText = ch.body.map((b) => (b as { text?: string }).text).join('');
    assert.match(currentText, /外部可打开的地址/);
  });

  it('conflict on bad base_revision', async () => {
    const before = (await httpJson(baseUrl, 'GET', '/v1/channels/ch_glossary')).body as {
      revision: string;
      body: unknown[];
    };
    const res = await httpJson(baseUrl, 'PATCH', '/v1/channels/ch_glossary', {
      body: {
        body: [{ type: 'text', text: '冲突测试', format: 'plain' }],
        base_revision: 'rev_missing',
      },
    });
    assert.equal(res.status, 409);
    assert.equal((res.body as { code: string }).code, 'conflict');
    const after = (await httpJson(baseUrl, 'GET', '/v1/channels/ch_glossary')).body as { body: unknown[] };
    assert.deepEqual(after.body, before.body);
  });

  it('anchor entry readable', async () => {
    const en = (await httpJson(baseUrl, 'GET', '/v1/entries/en_draft_ann')).body as {
      anchor: { block_id: string };
    };
    assert.equal(en.anchor.block_id, 'blk_draft_lead');
  });

  it('direction=in on glossary', async () => {
    const links = (await httpJson(baseUrl, 'GET', '/v1/channels/ch_glossary/links?direction=in')).body as {
      data: { source_id: string }[];
    };
    assert.ok(links.data.some((l) => l.source_id === 'ch_draft'));
  });

  it('file_terms bytes', async () => {
    const res = await fetch(`${baseUrl}/v1/files/file_terms`, {
      headers: { Authorization: 'Bearer demo-token' },
    });
    const text = await res.text();
    assert.equal(text, '频道\n讨论\n链接\n');
  });
});

describe('share mechanisms', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let token: string;

  before(async () => {
    const s = await startServer({
      providerId: 'notes',
      capabilities: NOTES_CAPS,
      seed: loadSeed('notes'),
      publicOrigin: 'http://127.0.0.1:9',
    });
    baseUrl = s.baseUrl;
    close = s.close;
    const share = await httpJson(baseUrl, 'POST', '/v1/channels/ch_draft/shares', {
      body: { scope: 'view', expires_at: null },
    });
    token = (share.body as { token: string }).token;
  });

  after(async () => {
    await close();
  });

  it('html escape title', async () => {
    const ch0 = (await httpJson(baseUrl, 'GET', '/v1/channels/ch_draft')).body as { revision: string };
    await httpJson(baseUrl, 'PATCH', '/v1/channels/ch_draft', {
      body: { title: '标题<b>加粗</b>', base_revision: ch0.revision },
    });
    const share2 = await httpJson(baseUrl, 'POST', '/v1/channels/ch_draft/shares', {
      body: { scope: 'view', expires_at: null },
    });
    const t = (share2.body as { token: string }).token;
    const html = await fetch(`${baseUrl}/s/${t}`, { headers: { Accept: 'text/html' } });
    const body = await html.text();
    assert.match(body, /标题&lt;b&gt;加粗&lt;\/b&gt;/);
    assert.doesNotMatch(body, /<b>加粗<\/b>/);
  });

  it('json share view', async () => {
    const res = await fetch(`${baseUrl}/s/${token}`, { headers: { Accept: 'application/json' } });
    const body = await res.json();
    assert.ok(body.channel);
    assert.ok(Array.isArray(body.entries));
    assert.equal(body.revisions, undefined);
  });

  it('revoke share', async () => {
    const share = await httpJson(baseUrl, 'POST', '/v1/channels/ch_draft/shares', {
      body: { scope: 'comment', expires_at: null },
    });
    const sh = share.body as { id: string; token: string };
    await httpJson(baseUrl, 'DELETE', `/v1/shares/${sh.id}`);
    const res = await fetch(`${baseUrl}/s/${sh.token}`);
    assert.equal((await res.json()).code, 'share_unavailable');
  });

  it('view scope forbids post', async () => {
    const res = await fetch(`${baseUrl}/s/${token}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: [{ type: 'text', text: 'x', format: 'plain' }] }),
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'share_forbidden');
  });

  it('comment scope guest author', async () => {
    const share = await httpJson(baseUrl, 'POST', '/v1/channels/ch_draft/shares', {
      body: { scope: 'comment', expires_at: null },
    });
    const t = (share.body as { token: string }).token;
    const res = await fetch(`${baseUrl}/s/${t}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: [{ type: 'text', text: '访客留言', format: 'plain' }] }),
    });
    assert.equal(res.status, 201);
    const entry = await res.json();
    assert.equal(entry.author.display_name, '访客');
    const html = await fetch(`${baseUrl}/s/${t}`, { headers: { Accept: 'text/html' } });
    const page = await html.text();
    assert.match(page, /application\/json/);
    assert.doesNotMatch(page, /method="post"/);
  });

  it('share file stays inside the channel', async () => {
    const gloss = await httpJson(baseUrl, 'POST', '/v1/channels/ch_glossary/shares', {
      body: { scope: 'view', expires_at: null },
    });
    const glossToken = (gloss.body as { token: string }).token;
    const denied = await fetch(`${baseUrl}/s/${token}/files/file_terms`);
    assert.equal(denied.status, 404);
    const ok = await fetch(`${baseUrl}/s/${glossToken}/files/file_terms`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), '频道\n讨论\n链接\n');
  });
});

describe('idempotency and files', () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  before(async () => {
    const s = await startServer({ providerId: 'tasks', capabilities: TASKS_CAPS, seed: loadSeed('tasks') });
    baseUrl = s.baseUrl;
    close = s.close;
  });

  after(async () => {
    await close();
  });

  it('idempotent entry', async () => {
    const body = {
      type: 'comment',
      body: [{ type: 'text', text: '幂等讨论', format: 'plain' }],
      parent_id: null,
      anchor: null,
    };
    const h = { 'Idempotency-Key': 'k1', 'Content-Type': 'application/json', Authorization: 'Bearer demo-token' };
    const r1 = await fetch(`${baseUrl}/v1/channels/ch_task_copy/entries`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    const e1 = await r1.json();
    const r2 = await fetch(`${baseUrl}/v1/channels/ch_task_copy/entries`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    const e2 = await r2.json();
    assert.equal(e1.id, e2.id);
    const conflict = await fetch(`${baseUrl}/v1/channels/ch_task_copy/entries`, {
      method: 'POST',
      headers: { ...h, 'Idempotency-Key': 'k1' },
      body: JSON.stringify({ ...body, body: [{ type: 'text', text: '不同', format: 'plain' }] }),
    });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).code, 'idempotency_conflict');
  });

  it('idempotent channel', async () => {
    const body = { type: 'task', title: '幂等频道', body: [{ type: 'text', text: '说明', format: 'plain' }] };
    const h = { 'Idempotency-Key': 'ch-k', 'Content-Type': 'application/json', Authorization: 'Bearer demo-token' };
    const r1 = await fetch(`${baseUrl}/v1/channels`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    const c1 = await r1.json();
    const r2 = await fetch(`${baseUrl}/v1/channels`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    const c2 = await r2.json();
    assert.equal(c1.id, c2.id);
    const list = (await httpJson(baseUrl, 'GET', '/v1/channels?type=task')).body as { data: { title: string }[] };
    assert.equal(list.data.filter((c) => c.title === '幂等频道').length, 1);
  });

  it('parallel body updates conflict on the same revision', async () => {
    const ch = (await httpJson(baseUrl, 'GET', '/v1/channels/ch_task_img')).body as { revision: string; title: string };
    const patch = (title: string) =>
      httpJson(baseUrl, 'PATCH', '/v1/channels/ch_task_img', {
        body: { title, base_revision: ch.revision },
      });
    const [a, b] = await Promise.all([patch('并行甲'), patch('并行乙')]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const conflict = a.status === 409 ? a : b;
    assert.equal((conflict.body as { code: string }).code, 'conflict');
    const after = (await httpJson(baseUrl, 'GET', '/v1/channels/ch_task_img')).body as { title: string };
    assert.ok(after.title === '并行甲' || after.title === '并行乙');
  });

  it('file upload roundtrip and file_not_found', async () => {
    const bytes = Buffer.from('hello file');
    const up = await fetch(`${baseUrl}/v1/files`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer demo-token',
        'Content-Type': 'text/plain',
        'X-File-Name': encodeURIComponent('a.txt'),
      },
      body: bytes,
    });
    const meta = await up.json();
    const down = await fetch(`${baseUrl}/v1/files/${meta.id}`, { headers: { Authorization: 'Bearer demo-token' } });
    assert.equal(Buffer.from(await down.arrayBuffer()).toString(), 'hello file');
    const bad = await httpJson(baseUrl, 'POST', '/v1/channels/ch_task_copy/entries', {
      body: {
        type: 'comment',
        body: [{ type: 'file', file: { id: 'file_nope' } }],
        parent_id: null,
        anchor: null,
      },
    });
    assert.equal(bad.status, 400);
    assert.equal((bad.body as { code: string }).code, 'file_not_found');
  });
});

describe('soft delete', () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  before(async () => {
    const s = await startServer({ providerId: 'chat', capabilities: CHAT_CAPS, seed: loadSeed('chat') });
    baseUrl = s.baseUrl;
    close = s.close;
  });

  after(async () => {
    await close();
  });

  it('deleted channel hidden unless include_deleted', async () => {
    const before = await httpJson(baseUrl, 'GET', '/v1/channels/ch_room_design');
    const deleted = (await httpJson(baseUrl, 'DELETE', '/v1/channels/ch_room_design')).body as {
      deleted_at: string;
      updated_at: string;
    };
    const list = (await httpJson(baseUrl, 'GET', '/v1/channels')).body as { data: { id: string }[] };
    assert.ok(!list.data.some((c) => c.id === 'ch_room_design'));
    const inc = await httpJson(
      baseUrl,
      'GET',
      `/v1/channels?include_deleted=true&updated_since=2020-01-01T00:00:00.000Z`,
    );
    const found = (inc.body as { data: { id: string; deleted_at: string }[] }).data.find((c) => c.id === 'ch_room_design');
    assert.ok(found?.deleted_at);
    const post = await httpJson(baseUrl, 'POST', '/v1/channels/ch_room_design/entries', {
      body: {
        type: 'message',
        body: [{ type: 'text', text: '不应成功', format: 'plain' }],
        parent_id: null,
        anchor: null,
      },
    });
    assert.equal(post.status, 409);
    assert.equal((post.body as { code: string }).code, 'deleted');
  });
});

describe('file range and size', () => {
  let baseUrl: string;
  let dataDir: string;
  let close: () => Promise<void>;
  let fileId: string;

  before(async () => {
    const s = await startServer({
      providerId: 'tasks',
      capabilities: TASKS_CAPS,
      seed: loadSeed('tasks'),
      maxFileBytes: 16,
    });
    baseUrl = s.baseUrl;
    dataDir = s.dataDir;
    close = s.close;
    const up = await fetch(`${baseUrl}/v1/files`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer demo-token',
        'Content-Type': 'text/plain',
        'X-File-Name': encodeURIComponent('r.txt'),
      },
      body: Buffer.from('abcdefghij'),
    });
    const meta = (await up.json()) as { id: string };
    fileId = meta.id;
  });

  after(async () => {
    await close();
  });

  it('full GET without Range is 200', async () => {
    const down = await fetch(`${baseUrl}/v1/files/${fileId}`, { headers: { Authorization: 'Bearer demo-token' } });
    assert.equal(down.status, 200);
    assert.equal(down.headers.get('accept-ranges'), 'bytes');
    assert.equal(Buffer.from(await down.arrayBuffer()).toString(), 'abcdefghij');
  });

  it('bytes=0-3 is 206', async () => {
    const down = await fetch(`${baseUrl}/v1/files/${fileId}`, {
      headers: { Authorization: 'Bearer demo-token', Range: 'bytes=0-3' },
    });
    assert.equal(down.status, 206);
    assert.equal(Buffer.from(await down.arrayBuffer()).toString(), 'abcd');
    assert.match(down.headers.get('content-range') ?? '', /bytes 0-3\/10/);
  });

  it('unsatisfiable range is 416', async () => {
    const down = await fetch(`${baseUrl}/v1/files/${fileId}`, {
      headers: { Authorization: 'Bearer demo-token', Range: 'bytes=999-' },
    });
    assert.equal(down.status, 416);
    assert.equal((await down.json()).code, 'range_not_satisfiable');
  });

  it('oversize upload leaves no file id or part', async () => {
    const namesBefore = new Set(fs.readdirSync(path.join(dataDir, 'files')));
    const up = await fetch(`${baseUrl}/v1/files`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer demo-token',
        'Content-Type': 'text/plain',
        'X-File-Name': encodeURIComponent('big.txt'),
      },
      body: Buffer.from('0123456789abcdef!'),
    });
    assert.equal(up.status, 413);
    assert.equal((await up.json()).code, 'file_too_large');
    const names = fs.readdirSync(path.join(dataDir, 'files'));
    assert.equal(names.some((n) => n.endsWith('.part')), false);
    const added = names.filter((n) => !namesBefore.has(n));
    assert.equal(added.length, 0);
  });
});

describe('link type filter', () => {
  it('project inbound parent vs blocks', async () => {
    const s = await startServer({ providerId: 'tasks', capabilities: TASKS_CAPS, seed: loadSeed('tasks') });
    try {
      const parent = (await httpJson(s.baseUrl, 'GET', '/v1/channels/ch_proj/links?direction=in&type=parent'))
        .body as { data: { source_id: string }[] };
      const ids = parent.data.map((l) => l.source_id).sort();
      assert.deepEqual(ids, ['ch_task_copy', 'ch_task_img']);
      const blocks = (await httpJson(s.baseUrl, 'GET', '/v1/channels/ch_proj/links?direction=in&type=blocks'))
        .body as { data: unknown[] };
      assert.equal(blocks.data.length, 0);
      const allIn = (await httpJson(s.baseUrl, 'GET', '/v1/channels/ch_proj/links?direction=in')).body as {
        data: unknown[];
      };
      assert.equal(allIn.data.length, 2);
    } finally {
      await s.close();
    }
  });

  it('note outbound references', async () => {
    const s = await startServer({ providerId: 'notes', capabilities: NOTES_CAPS, seed: loadSeed('notes') });
    try {
      const refs = (await httpJson(s.baseUrl, 'GET', '/v1/channels/ch_draft/links?direction=out&type=references'))
        .body as { data: { target_id: string }[] };
      assert.equal(refs.data.length, 1);
      assert.equal(refs.data[0]!.target_id, 'ch_glossary');
      const none = (await httpJson(s.baseUrl, 'GET', '/v1/channels/ch_draft/links?type=parent')).body as {
        data: unknown[];
      };
      assert.equal(none.data.length, 0);
      const all = (await httpJson(s.baseUrl, 'GET', '/v1/channels/ch_draft/links')).body as { data: unknown[] };
      assert.equal(all.data.length, 1);
    } finally {
      await s.close();
    }
  });
});
