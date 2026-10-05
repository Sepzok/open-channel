import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHubPage } from '../page.js';
import { HUB_TARGETS, probeTarget, resolveHubTargets } from '../targets.js';

const root = path.dirname(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))));

describe('hub entry', () => {
  it('lists every example origin with genre labels', () => {
    const targets = resolveHubTargets({});
    assert.equal(targets.length, 6);
    const html = renderHubPage({ locale: 'zh', targets });
    assert.match(html, /本地例子入口/);
    assert.match(html, /Open Channel/);
    for (const t of HUB_TARGETS) {
      assert.match(html, new RegExp(`href="${t.defaultUrl.replace(/\./g, '\\.')}"`));
      assert.match(html, new RegExp(t.genreZh));
      assert.match(html, new RegExp(t.titleZh));
    }
    assert.doesNotMatch(html, /section-band/);
    assert.doesNotMatch(html, /demo-token/);
    assert.doesNotMatch(html, /app-chat/);
    const en = renderHubPage({ locale: 'en', targets });
    assert.match(en, /Local examples/);
    assert.match(en, /Fusion Console/);
    assert.match(en, /Messenger/);
  });

  it('resolveHubTargets honors env overrides', () => {
    const rows = resolveHubTargets({
      OCP_CHAT_URL: 'http://127.0.0.1:9',
      OCP_CONSOLE_URL: 'http://127.0.0.1:8',
    });
    assert.equal(rows.find((r) => r.id === 'chat')?.url, 'http://127.0.0.1:9');
    assert.equal(rows.find((r) => r.id === 'console')?.url, 'http://127.0.0.1:8');
    assert.equal(rows.find((r) => r.id === 'notes')?.url, 'http://127.0.0.1:8783');
  });

  it('probeTarget is true only for HTML home pages', async () => {
    const okServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body>ok</body></html>');
    });
    await new Promise<void>((resolve) => okServer.listen(0, '127.0.0.1', resolve));
    const okPort = (okServer.address() as { port: number }).port;

    const jsonServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    await new Promise<void>((resolve) => jsonServer.listen(0, '127.0.0.1', resolve));
    const jsonPort = (jsonServer.address() as { port: number }).port;

    try {
      assert.equal(await probeTarget(`http://127.0.0.1:${okPort}`), true);
      assert.equal(await probeTarget(`http://127.0.0.1:${jsonPort}`), false);
      assert.equal(await probeTarget('http://127.0.0.1:1'), false);
    } finally {
      await new Promise<void>((resolve, reject) => okServer.close((e) => (e ? reject(e) : resolve())));
      await new Promise<void>((resolve, reject) => jsonServer.close((e) => (e ? reject(e) : resolve())));
    }
  });

  it('hub process serves page and status without tokens', async () => {
    const chat = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html></html>');
    });
    await new Promise<void>((resolve) => chat.listen(0, '127.0.0.1', resolve));
    const chatPort = (chat.address() as { port: number }).port;

    const child: ChildProcess = spawn(
      process.execPath,
      ['--import', 'tsx', path.join(root, 'examples/hub/index.ts')],
      {
        cwd: root,
        env: {
          ...process.env,
          PORT: '0',
          OCP_CHAT_URL: `http://127.0.0.1:${chatPort}`,
          OCP_CONSOLE_URL: 'http://127.0.0.1:1',
          OCP_TASKS_URL: 'http://127.0.0.1:1',
          OCP_NOTES_URL: 'http://127.0.0.1:1',
          OCP_NATIVE_URL: 'http://127.0.0.1:1',
          OCP_WALK_URL: 'http://127.0.0.1:1',
        },
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    );
    const baseUrl = await new Promise<string>((resolve, reject) => {
      let buf = '';
      const timer = setTimeout(() => reject(new Error('hub timeout')), 20000);
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
      const page = await fetch(`${baseUrl}/?lang=zh`);
      const html = await page.text();
      assert.equal(page.status, 200);
      assert.match(html, new RegExp(`href="http://127\\.0\\.0\\.1:${chatPort}"`));
      assert.doesNotMatch(html, /demo-token/);

      const status = await fetch(`${baseUrl}/api/status`);
      const body = (await status.json()) as { targets: { id: string; ok: boolean }[] };
      assert.equal(status.status, 200);
      assert.equal(body.targets.find((t) => t.id === 'chat')?.ok, true);
      assert.equal(body.targets.find((t) => t.id === 'console')?.ok, false);
    } finally {
      child.kill('SIGTERM');
      await new Promise<void>((resolve, reject) => chat.close((e) => (e ? reject(e) : resolve())));
    }
  });
});
