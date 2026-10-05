import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ACTOR, TASKS_CAPS, httpJson, startServer, tempDataDir } from './helpers.js';
import { importSeed } from '../src/seed.js';
import { Store } from '../src/store.js';
import { matchScimFilter, parseScimFilter } from '../src/scimFilter.js';

function ids(body: unknown): string[] {
  return ((body as { data: { id: string }[] }).data ?? []).map((c) => c.id);
}

describe('SCIM filter parser', () => {
  it('eq and type mismatch', () => {
    const p = parseScimFilter('ext.artist eq "林可"');
    assert.equal(p.ok, true);
    if (!p.ok) return;
    assert.equal(matchScimFilter({ id: 'a', type: 't', title: 'n', ext: { artist: '林可' } }, p.ast), true);
    assert.equal(matchScimFilter({ id: 'a', type: 't', title: 'n', ext: { artist: '别人' } }, p.ast), false);
  });

  it('rejects unknown attribute and null', () => {
    assert.equal(parseScimFilter('foo eq "x"').ok, false);
    assert.equal(parseScimFilter('ext.artist eq null').ok, false);
    assert.equal(parseScimFilter('ext.duration_ms gt abc').ok, false);
  });

  it('caps length and depth', () => {
    assert.equal(parseScimFilter('x'.repeat(1025)).ok, false);
    assert.equal(parseScimFilter('(((((ext.status pr)))))').ok, false);
    assert.equal(parseScimFilter('((((ext.status pr))))').ok, true);
  });

  it('entry kind rejects title path', () => {
    assert.equal(parseScimFilter('title eq "x"', 'entry').ok, false);
    assert.equal(parseScimFilter('type eq "comment"', 'entry').ok, true);
  });
});

describe('channel ext and list filter', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let lin: string;
  let zhou: string;
  let none: string;
  let strDur: string;

  before(async () => {
    const s = await startServer({
      providerId: 'tasks',
      providerName: '示例任务',
      capabilities: TASKS_CAPS,
    });
    baseUrl = s.baseUrl;
    close = s.close;

    const mk = async (title: string, ext: Record<string, string | number | boolean>) => {
      const res = await httpJson(baseUrl, 'POST', '/v1/channels', {
        body: { type: 'track', title, body: [], members: [], ext },
      });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return (res.body as { id: string }).id;
    };
    lin = await mk('林可曲', { artist: '林可', album: '周刊', duration_ms: 200000 });
    zhou = await mk('周宁曲', { artist: '周宁', duration_ms: 100000 });
    none = await mk('无艺人', { album: '周刊' });
    strDur = await mk('字符串时长', { duration_ms: '200000' });
  });

  after(async () => {
    await close();
  });

  async function list(filter: string) {
    const q = new URLSearchParams({ filter });
    return httpJson(baseUrl, 'GET', `/v1/channels?${q.toString()}`);
  }

  it('keeps duration_ms as number', async () => {
    const res = await httpJson(baseUrl, 'GET', `/v1/channels/${lin}`);
    assert.equal(typeof (res.body as { ext: { duration_ms: unknown } }).ext.duration_ms, 'number');
    assert.equal((res.body as { ext: { duration_ms: number } }).ext.duration_ms, 200000);
  });

  it('eq artist', async () => {
    const res = await list('ext.artist eq "林可"');
    assert.equal(res.status, 200);
    assert.deepEqual(ids(res.body).sort(), [lin].sort());
    const miss = await list('ext.artist eq "别人"');
    assert.equal(ids(miss.body).length, 0);
  });

  it('AND artist and album', async () => {
    const hit = await list('ext.artist eq "林可" and ext.album eq "周刊"');
    assert.deepEqual(ids(hit.body), [lin]);
    const miss = await list('ext.artist eq "林可" and ext.album eq "其它"');
    assert.equal(ids(miss.body).length, 0);
  });

  it('same-key OR', async () => {
    const res = await list('ext.artist eq "林可" or ext.artist eq "周宁"');
    assert.deepEqual(ids(res.body).sort(), [lin, zhou].sort());
  });

  it('cross-key grouped OR', async () => {
    const res = await list('(ext.artist eq "林可" or ext.album eq "周刊")');
    assert.deepEqual(ids(res.body).sort(), [lin, none].sort());
  });

  it('ne skips missing key', async () => {
    const res = await list('ext.artist ne "林可"');
    assert.deepEqual(ids(res.body), [zhou]);
  });

  it('co substring; number field is false', async () => {
    const res = await list('ext.album co "周"');
    assert.deepEqual(ids(res.body).sort(), [lin, none].sort());
    const num = await list('ext.duration_ms co "200"');
    assert.equal(num.status, 200);
    assert.equal(ids(num.body).includes(lin), false);
  });

  it('gt number; string duration misses; bad literal 400', async () => {
    const res = await list('ext.duration_ms gt 180000');
    assert.deepEqual(ids(res.body), [lin]);
    assert.equal(ids(res.body).includes(strDur), false);
    const bad = await list('ext.duration_ms gt abc');
    assert.equal(bad.status, 400);
  });

  it('unknown ext query key 400', async () => {
    const res = await httpJson(baseUrl, 'GET', '/v1/channels?ext.artist.eq=%E6%9E%97%E5%8F%AF');
    assert.equal(res.status, 400);
  });

  it('too long and too deep 400', async () => {
    const long = await list('x'.repeat(1025));
    assert.equal(long.status, 400);
    const deep = await list('(((((ext.status pr)))))');
    assert.equal(deep.status, 400);
  });

  it('PATCH empty ext drops eq and pr', async () => {
    const created = await httpJson(baseUrl, 'POST', '/v1/channels', {
      body: { type: 'task', title: '可清空', body: [], members: [], ext: { status: '撰写中' } },
    });
    const id = (created.body as { id: string }).id;
    const before = await list(`id eq "${id}" and ext.status pr`);
    assert.deepEqual(ids(before.body), [id]);
    const patched = await httpJson(baseUrl, 'PATCH', `/v1/channels/${id}`, { body: { ext: {} } });
    assert.equal(patched.status, 200);
    assert.equal((patched.body as { ext?: unknown }).ext, undefined);
    const afterEq = await list(`id eq "${id}" and ext.status eq "撰写中"`);
    assert.equal(ids(afterEq.body).length, 0);
    const afterPr = await list(`id eq "${id}" and ext.status pr`);
    assert.equal(ids(afterPr.body).length, 0);
  });

  it('nested ext rejected', async () => {
    const res = await httpJson(baseUrl, 'POST', '/v1/channels', {
      body: { type: 'task', title: '坏', body: [], members: [], ext: { album: { name: '周刊' } } },
    });
    assert.equal(res.status, 400);
  });

  it('share json includes ext', async () => {
    const sh = await httpJson(baseUrl, 'POST', `/v1/channels/${lin}/shares`, { body: { scope: 'view', expires_at: null } });
    const token = (sh.body as { token: string }).token;
    const json = await fetch(`${baseUrl}/s/${token}`, { headers: { Accept: 'application/json' } });
    const body = (await json.json()) as { channel: { ext: { artist: string } } };
    assert.equal(body.channel.ext.artist, '林可');
  });

  it('filters entries and rejects title path', async () => {
    const a = await httpJson(baseUrl, 'POST', `/v1/channels/${lin}/entries`, {
      body: { type: 'comment', body: [{ type: 'text', text: '公开评', format: 'plain' }], parent_id: null, anchor: null, ext: { status: '公开' } },
    });
    const b = await httpJson(baseUrl, 'POST', `/v1/channels/${lin}/entries`, {
      body: { type: 'comment', body: [{ type: 'text', text: '草稿评', format: 'plain' }], parent_id: null, anchor: null, ext: { status: '草稿' } },
    });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    const q = new URLSearchParams({ filter: 'ext.status eq "公开"' });
    const res = await httpJson(baseUrl, 'GET', `/v1/channels/${lin}/entries?${q.toString()}`);
    const data = (res.body as { data: { id: string }[] }).data;
    assert.deepEqual(data.map((e) => e.id), [(a.body as { id: string }).id]);
    const bad = await httpJson(baseUrl, 'GET', `/v1/channels/${lin}/entries?${new URLSearchParams({ filter: 'title eq "x"' }).toString()}`);
    assert.equal(bad.status, 400);
  });

  it('filters links by title', async () => {
    await httpJson(baseUrl, 'POST', `/v1/channels/${lin}/links`, {
      body: { type: 'related', target_id: zhou, title: '所属项目' },
    });
    await httpJson(baseUrl, 'POST', `/v1/channels/${lin}/links`, {
      body: { type: 'related', target_id: none, title: '其它边' },
    });
    const q = new URLSearchParams({ filter: 'title co "所属"' });
    const res = await httpJson(baseUrl, 'GET', `/v1/channels/${lin}/links?${q.toString()}`);
    const titles = ((res.body as { data: { title?: string }[] }).data ?? []).map((l) => l.title);
    assert.deepEqual(titles, ['所属项目']);
  });
});

describe('seed ext validation', () => {
  it('rejects illegal ext and does not write store.json', () => {
    const dataDir = tempDataDir();
    const store = new Store({
      providerId: 'tasks',
      providerName: '示例任务',
      capabilities: TASKS_CAPS,
      actor: ACTOR,
      token: 'demo-token',
      dataDir,
      publicOrigin: 'http://127.0.0.1:0',
    });
    assert.throws(
      () =>
        importSeed(store, {
          channels: [{ id: 'ch_bad', type: 'task', title: '坏种子', ext: { Artist: '林可' } }],
        }),
      /Invalid seed ext/,
    );
    assert.equal(fs.existsSync(path.join(dataDir, 'store.json')), false);
  });
});
