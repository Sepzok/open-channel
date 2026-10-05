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
    const dataDir = path.join(root, 'e2e', `_data_surface_${path.basename(path.dirname(entry))}`);
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
  const chatPort = await getFreePort();
  const tasksPort = await getFreePort();
  const notesPort = await getFreePort();
  const nativePort = await getFreePort();
  const walkPort = await getFreePort();
  const children = [];
  children.push(await startProc('examples/chat/index.ts', chatPort));
  children.push(await startProc('examples/tasks/index.ts', tasksPort));
  children.push(await startProc('examples/notes/index.ts', notesPort));
  children.push(await startProc('examples/native/index.ts', nativePort));
  children.push(await startProc('examples/walk/index.ts', walkPort));

  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${chatPort}/?lang=zh`);
    await page.locator('.im-item', { hasText: '发布小组' }).click();
    await page.locator('.im-bubble', { hasText: '今天把配图导出' }).waitFor();
    await page.locator('button.enter-as', { hasText: '林可' }).click();
    await page.locator('#compose-text').waitFor();
    await page.locator('#compose-text').fill('展示页消息验收句');
    await page.locator('#compose-send').click();
    await page.locator('.im-bubble', { hasText: '展示页消息验收句' }).waitFor();

    await page.goto(`http://127.0.0.1:${tasksPort}/?lang=zh`);
    await page.locator('.pm-nav .pm-item', { hasText: '首页文案' }).click();
    await page.getByText('撰写中').waitFor();
    await page.getByText('按笔记里的口径写首页主标题和副标题。').waitFor();

    await page.goto(`http://127.0.0.1:${notesPort}/?lang=zh`);
    await page.locator('.doc-item', { hasText: '接口草案' }).click();
    await page.locator('.doc-paper').getByText('频道是可寻址的容器').waitFor();
    await page.locator('.ann-mark').waitFor();

    await page.goto(`http://127.0.0.1:${nativePort}/?lang=zh`);
    await page.locator('.native-id', { hasText: 'T-100' }).waitFor();
    await page.locator('h1', { hasText: '验收清单' }).waitFor();

    await page.goto(`http://127.0.0.1:${walkPort}/?lang=zh`);
    await page.locator('#playfield').waitFor();
    await page.locator('#walk-start').waitFor();
    await page.getByRole('heading', { name: '走动房间' }).waitFor();

    console.log('e2e surfaces: ok');
  } finally {
    await browser.close();
    for (const c of children) c.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
