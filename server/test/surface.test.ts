import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_CAPS, NOTES_CAPS, TASKS_CAPS, httpJson, loadSeed, startServer } from './helpers.js';
import { renderWalkPage } from '../../examples/walk/page.js';
import path from 'node:path';
import { spawn } from 'node:child_process';

const repoRoot = process.cwd();

describe('example surface pages', () => {
  it('unset surface GET / stays a problem document', async () => {
    const s = await startServer({
      providerId: 'chat',
      capabilities: CHAT_CAPS,
      seed: loadSeed('chat'),
    });
    const res = await fetch(`${s.baseUrl}/`, { headers: { Accept: 'text/html' } });
    assert.equal(res.status, 404);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, 'not_found');
    const denied = await httpJson(s.baseUrl, 'GET', '/v1/channels', { token: null });
    assert.equal(denied.status, 401);
    await s.close();
  });

  it('chat page is a messenger shell with seed threads, not the fusion console', async () => {
    const s = await startServer({
      providerId: 'chat',
      providerName: '示例会话',
      capabilities: CHAT_CAPS,
      seed: loadSeed('chat'),
      surface: 'chat',
    });
    const res = await fetch(`${s.baseUrl}/`, { headers: { Accept: 'text/html' } });
    const html = await res.text();
    assert.equal(res.headers.get('content-type')?.includes('text/html'), true);
    assert.match(html, /surface-chat/);
    assert.match(html, /app-chat/);
    assert.match(html, /发布小组/);
    assert.match(html, /今天把配图导出/);
    assert.doesNotMatch(html, /section-band/);
    assert.doesNotMatch(html, /<title>融合台/);
    assert.doesNotMatch(html, /demo-token/);
    const en = await fetch(`${s.baseUrl}/?lang=en`, { headers: { Accept: 'text/html' } });
    const enHtml = await en.text();
    assert.match(enHtml, /Release team/);
    await s.close();
  });

  it('tasks page is a project board with status', async () => {
    const s = await startServer({
      providerId: 'tasks',
      providerName: '示例任务',
      capabilities: TASKS_CAPS,
      seed: loadSeed('tasks'),
      surface: 'tasks',
    });
    const html = await (await fetch(`${s.baseUrl}/`)).text();
    assert.match(html, /surface-tasks/);
    assert.match(html, /pm-nav/);
    assert.match(html, /官网改版/);
    assert.match(html, /首页文案/);
    assert.match(html, /撰写中/);
    assert.doesNotMatch(html, /section-band/);
    await s.close();
  });

  it('notes page is a document with annotation quote', async () => {
    const s = await startServer({
      providerId: 'notes',
      providerName: '示例笔记',
      capabilities: NOTES_CAPS,
      seed: loadSeed('notes'),
      surface: 'notes',
    });
    const html = await (await fetch(`${s.baseUrl}/`)).text();
    assert.match(html, /surface-notes/);
    assert.match(html, /doc-paper/);
    assert.match(html, /接口草案/);
    assert.match(html, /可寻址的容器/);
    assert.match(html, /术语.txt/);
    assert.doesNotMatch(html, /demo-token/);
    await s.close();
  });

  it('walk page is a room stage', async () => {
    const s = await startServer({
      providerId: 'walk',
      providerName: '对局房间',
      capabilities: CHAT_CAPS,
      seed: loadSeed('walk'),
      renderHome: (ctx) => renderWalkPage(ctx),
    });
    const html = await (await fetch(`${s.baseUrl}/`)).text();
    assert.match(html, /playfield/);
    assert.match(html, /走动房间/);
    assert.match(html, /walk-start/);
    assert.doesNotMatch(html, /demo-token/);
    await s.close();
  });

  it('native page is a ticket with native_id', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', path.join(repoRoot, 'examples/native/index.ts')], {
      cwd: repoRoot,
      env: { ...process.env, PORT: '0' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const baseUrl = await new Promise<string>((resolve, reject) => {
      let buf = '';
      const timer = setTimeout(() => reject(new Error('native timeout')), 20000);
      child.stdout?.on('data', (d: Buffer) => {
        buf += d.toString();
        const m = buf.match(/http:\/\/[^\s]+/);
        if (m) {
          clearTimeout(timer);
          resolve(m[0]);
        }
      });
      child.on('error', reject);
    });
    try {
      const html = await (await fetch(`${baseUrl}/`)).text();
      assert.match(html, /class="ticket"/);
      assert.match(html, /T-100/);
      assert.match(html, /验收清单/);
      assert.match(html, /native-id/);
      assert.doesNotMatch(html, /createApp/);
      assert.doesNotMatch(html, /demo-token/);
      const api = await fetch(`${baseUrl}/v1/channels`);
      assert.equal(api.status, 401);
    } finally {
      child.kill('SIGTERM');
    }
  });

  it('group share HTML uses message bubbles', async () => {
    const s = await startServer({
      providerId: 'chat',
      capabilities: CHAT_CAPS,
      seed: loadSeed('chat'),
    });
    const share = await httpJson(s.baseUrl, 'POST', '/v1/channels/ch_grp_release/shares', {
      body: { scope: 'view' },
    });
    const token = (share.body as { token: string }).token;
    const html = await (await fetch(`${s.baseUrl}/s/${token}`, { headers: { Accept: 'text/html' } })).text();
    assert.match(html, /share-im/);
    assert.match(html, /message-bubble/);
    assert.match(html, /发布小组/);
    await s.close();
  });
});
