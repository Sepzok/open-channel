import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import fs from 'node:fs';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

function startProc(entry, port, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const dataDir = path.join(root, 'e2e', `_data_hub_${path.basename(path.dirname(entry))}_${port}`);
    fs.rmSync(dataDir, { recursive: true, force: true });
    const child = spawn(process.execPath, [tsx, path.join(root, entry)], {
      cwd: root,
      env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ...extraEnv },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`timeout ${entry}`)), 30000);
    child.stdout.on('data', (d) => {
      buf += d.toString();
      if (buf.includes('http://')) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.on('error', reject);
  });
}

async function main() {
  const hubPort = await getFreePort();
  const chatPort = await getFreePort();
  const consolePort = await getFreePort();
  const children = [];
  children.push(await startProc('examples/chat/index.ts', chatPort));
  children.push(await startProc('examples/console/index.ts', consolePort, {
    OCP_CHAT_URL: `http://127.0.0.1:${chatPort}`,
    OCP_TASKS_URL: `http://127.0.0.1:1`,
    OCP_NOTES_URL: `http://127.0.0.1:1`,
  }));
  children.push(
    await startProc('examples/hub/index.ts', hubPort, {
      OCP_CHAT_URL: `http://127.0.0.1:${chatPort}`,
      OCP_CONSOLE_URL: `http://127.0.0.1:${consolePort}`,
      OCP_TASKS_URL: 'http://127.0.0.1:1',
      OCP_NOTES_URL: 'http://127.0.0.1:1',
      OCP_NATIVE_URL: 'http://127.0.0.1:1',
      OCP_WALK_URL: 'http://127.0.0.1:1',
    }),
  );

  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${hubPort}/?lang=zh`);
    await page.getByText('本地例子入口').waitFor();
    const chatLink = page.locator('a.dest[data-id="chat"]');
    await chatLink.waitFor();
    await page.locator('[data-status="chat"].up').waitFor({ timeout: 10000 });
    const href = await chatLink.getAttribute('href');
    if (!href || !href.includes(String(chatPort))) throw new Error(`bad chat href ${href}`);
    await page.goto(`${href}?lang=zh`);
    await page.locator('.app-chat').waitFor();
    await page.locator('.im-item', { hasText: '发布小组' }).waitFor();

    await page.goto(`http://127.0.0.1:${hubPort}/?lang=en`);
    await page.getByText('Local examples').waitFor();
    await page.locator('a.dest[data-id="console"]').waitFor();

    console.log('e2e hub: ok');
  } finally {
    await browser.close();
    for (const c of children) c.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
