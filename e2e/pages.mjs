import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, before, after } from 'node:test';
import { chromium } from 'playwright';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, '..');
const site = path.join(repo, 'site');

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

describe('pages demos', () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string} */
  let base;
  /** @type {import('playwright').Browser} */
  let browser;

  before(async () => {
    server = createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      let rel = decodeURIComponent(u.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(site, rel.replace(/^\//, ''));
      if (!file.startsWith(site)) {
        res.writeHead(403);
        res.end();
        return;
      }
      try {
        const body = readFileSync(file);
        res.writeHead(200, { 'Content-Type': contentType(file) });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    base = `http://127.0.0.1:${port}`;
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  });

  after(async () => {
    await browser?.close();
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('chat: sign in and send a bubble', async () => {
    const page = await browser.newPage();
    await page.goto(`${base}/chat/`, { waitUntil: 'domcontentloaded' });
    await page.locator('.enter-as').first().click();
    await page.waitForSelector('#compose-text');
    const text = `Pages体验 ${Date.now()}`;
    await page.fill('#compose-text', text);
    await page.click('#compose-send');
    await page.waitForFunction((t) => document.body.innerText.includes(t), text);
    assert.ok(await page.locator('.im-bubble').filter({ hasText: text }).count());
    await page.close();
  });

  it('walk: start places actors without WebSocket', async () => {
    const page = await browser.newPage();
    await page.goto(`${base}/walk/`, { waitUntil: 'domcontentloaded' });
    await page.click('#walk-start');
    await page.waitForFunction(() => {
      const lin = document.getElementById('actor-lin');
      return lin && !lin.hidden;
    });
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(50);
    const left = await page.locator('#actor-lin').evaluate((el) => el.style.left);
    assert.ok(left);
    await page.close();
  });

  it('console: lists channels from three providers', async () => {
    const page = await browser.newPage();
    await page.goto(`${base}/console/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#channel-list .channel-item');
    const n = await page.locator('#channel-list .channel-item').count();
    assert.ok(n >= 3);
    await page.close();
  });
});
