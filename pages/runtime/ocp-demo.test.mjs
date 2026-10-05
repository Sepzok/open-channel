import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, before } from 'node:test';
import vm from 'node:vm';

const dir = path.dirname(fileURLToPath(import.meta.url));

describe('ocp-demo runtime', () => {
  /** @type {any} */
  let g;

  before(() => {
    const code = readFileSync(path.join(dir, 'ocp-demo.js'), 'utf8');
    g = {
      window: undefined,
      location: { href: 'http://127.0.0.1/chat/', origin: 'http://127.0.0.1', pathname: '/chat/' },
      localStorage: {
        _m: new Map(),
        getItem(k) {
          return this._m.has(k) ? this._m.get(k) : null;
        },
        setItem(k, v) {
          this._m.set(k, String(v));
        },
        removeItem(k) {
          this._m.delete(k);
        },
      },
      crypto: {
        getRandomValues(arr) {
          for (let i = 0; i < arr.length; i++) arr[i] = (i * 17 + 3) & 0xff;
          return arr;
        },
      },
      fetch: async () => new Response('fallback', { status: 599 }),
      Response,
      URL,
      navigator: {},
      SNAPSHOT: {
        provider: { id: 'chat', name: '示例会话' },
        accounts: [{ id: 'u_lin', display_name: '林可' }],
        channels: [{ id: 'ch_grp_release', type: 'group', title: '发布小组', body: [], members: [] }],
        entries: [],
        links: [],
        revisions: [],
      },
    };
    g.window = g;
    g.globalThis = g;
    vm.runInNewContext(code, g, { filename: 'ocp-demo.js' });
  });

  it('creates a session with demo-pass', async () => {
    const res = await g.fetch('v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'u_lin', password: 'demo-pass' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.token);
    assert.equal(body.account.id, 'u_lin');
  });

  it('posts an entry and returns it', async () => {
    const sess = await g.fetch('v1/sessions', {
      method: 'POST',
      body: JSON.stringify({ id: 'u_lin', password: 'demo-pass' }),
    }).then((r) => r.json());
    const res = await g.fetch('v1/channels/ch_grp_release/entries', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + sess.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'message',
        body: [{ type: 'text', text: 'hello-pages', format: 'plain' }],
        parent_id: null,
        anchor: null,
      }),
    });
    assert.equal(res.status, 201);
    const entry = await res.json();
    assert.equal(entry.body[0].text, 'hello-pages');
    assert.equal(entry.author.id, 'u_lin');
  });
});
