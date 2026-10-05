import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CHAT_CAPS, NOTES_CAPS, httpJson, loadSeed, startServer } from './helpers.js';

describe('accounts sessions grants', () => {
  let chatUrl: string;
  let notesUrl: string;
  let closeChat: () => Promise<void>;
  let closeNotes: () => Promise<void>;
  let chatDir: string;

  before(async () => {
    const chat = await startServer({ providerId: 'chat', capabilities: CHAT_CAPS, seed: loadSeed('chat') });
    chatUrl = chat.baseUrl;
    closeChat = chat.close;
    chatDir = chat.dataDir;
    const notes = await startServer({ providerId: 'notes', capabilities: NOTES_CAPS, seed: loadSeed('notes') });
    notesUrl = notes.baseUrl;
    closeNotes = notes.close;
  });

  after(async () => {
    await closeChat();
    await closeNotes();
  });

  it('xu guest cannot see 设计讨论', async () => {
    const login = await httpJson(chatUrl, 'POST', '/v1/sessions', {
      token: null,
      body: { id: 'u_xu', password: 'demo-pass' },
    });
    assert.equal(login.status, 201);
    const token = (login.body as { token: string }).token;
    const list = (await httpJson(chatUrl, 'GET', '/v1/channels', { token })).body as { data: { title: string }[] };
    const titles = list.data.map((c) => c.title);
    assert.ok(titles.includes('发布小组'));
    assert.ok(!titles.includes('设计讨论'));
    const denied = await httpJson(chatUrl, 'GET', '/v1/channels/ch_room_design', { token });
    assert.equal(denied.status, 403);
    assert.equal((denied.body as { code: string }).code, 'forbidden');
    const ch = (await httpJson(chatUrl, 'GET', '/v1/channels/ch_grp_release', { token })).body as { revision: string | null };
    const members = await httpJson(chatUrl, 'PATCH', '/v1/channels/ch_grp_release', {
      token,
      body: { members: [{ id: 'u_xu', display_name: '许安', role: 'owner' }] },
    });
    assert.equal(members.status, 403);
    void ch;
  });

  it('demo-token still lists every chat channel', async () => {
    const list = (await httpJson(chatUrl, 'GET', '/v1/channels')).body as { data: { title: string }[] };
    const titles = list.data.map((c) => c.title);
    assert.ok(titles.includes('设计讨论'));
    assert.ok(titles.includes('发布小组'));
  });

  it('password hash stays off public json', async () => {
    const disc = await httpJson(chatUrl, 'GET', '/v1');
    assert.doesNotMatch(disc.raw, /password/);
    const list = await httpJson(chatUrl, 'GET', '/v1/channels');
    assert.doesNotMatch(list.raw, /password_hash/);
    const accounts = await httpJson(chatUrl, 'GET', '/v1/accounts');
    assert.equal(accounts.status, 200);
    assert.doesNotMatch(accounts.raw, /password/);
    const store = fs.readFileSync(path.join(chatDir, 'store.json'), 'utf8');
    assert.match(store, /password_hash/);
    assert.doesNotMatch(JSON.stringify(JSON.parse(store).channels), /password_hash/);
  });

  it('grant requires expires_at and scopes write', async () => {
    const missing = await httpJson(notesUrl, 'POST', '/v1/grants', {
      body: { channel_id: 'ch_draft', scope: 'comment' },
    });
    assert.equal(missing.status, 400);
    const past = await httpJson(notesUrl, 'POST', '/v1/grants', {
      body: { channel_id: 'ch_draft', scope: 'comment', expires_at: '2000-01-01T00:00:00.000Z' },
    });
    assert.equal(past.status, 400);
    const exp = new Date(Date.now() + 60_000).toISOString();
    const g = await httpJson(notesUrl, 'POST', '/v1/grants', {
      body: { channel_id: 'ch_draft', scope: 'comment', expires_at: exp },
    });
    assert.equal(g.status, 201);
    const token = (g.body as { token: string }).token;
    const comment = await httpJson(notesUrl, 'POST', '/v1/channels/ch_draft/entries', {
      token,
      body: { type: 'comment', body: [{ type: 'text', text: '授权留言', format: 'plain' }] },
    });
    assert.equal(comment.status, 201);
    assert.equal((comment.body as { author: { display_name: string } }).author.display_name, '临时访问');
    const ch = (await httpJson(notesUrl, 'GET', '/v1/channels/ch_draft', { token })).body as { revision: string };
    const patch = await httpJson(notesUrl, 'PATCH', '/v1/channels/ch_draft', {
      token,
      body: { title: '不该改', base_revision: ch.revision },
    });
    assert.equal(patch.status, 403);
  });

  it('expired grant is unauthorized', async () => {
    const exp = new Date(Date.now() + 800).toISOString();
    const g = await httpJson(notesUrl, 'POST', '/v1/grants', {
      body: { channel_id: 'ch_draft', scope: 'view', expires_at: exp },
    });
    const token = (g.body as { token: string }).token;
    await new Promise((r) => setTimeout(r, 1100));
    const res = await httpJson(notesUrl, 'GET', '/v1/channels/ch_draft', { token });
    assert.equal(res.status, 401);
    assert.equal((res.body as { code: string }).code, 'unauthorized');
  });
});
