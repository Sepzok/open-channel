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

function startProvider(entry, port, dataSubdir) {
  return new Promise((resolve, reject) => {
    const dataDir = path.join(root, 'e2e', dataSubdir);
    fs.rmSync(dataDir, { recursive: true, force: true });
    const child = spawn(process.execPath, [tsx, path.join(root, entry)], {
      cwd: root,
      env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`timeout starting ${entry}`)), 30000);
    child.stdout.on('data', (d) => {
      buf += d.toString();
      if (buf.includes('http://')) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) reject(new Error(`${entry} exited ${code}`));
    });
  });
}

async function main() {
  const chatPort = await getFreePort();
  const tasksPort = await getFreePort();
  const notesPort = await getFreePort();
  const consolePort = await getFreePort();

  const children = [];
  children.push(await startProvider('examples/chat/index.ts', chatPort, '_data_chat'));
  children.push(await startProvider('examples/tasks/index.ts', tasksPort, '_data_tasks'));
  children.push(await startProvider('examples/notes/index.ts', notesPort, '_data_notes'));

  const consoleChild = spawn(process.execPath, [tsx, path.join(root, 'examples/console/index.ts')], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(consolePort),
      OCP_CHAT_URL: `http://127.0.0.1:${chatPort}`,
      OCP_TASKS_URL: `http://127.0.0.1:${tasksPort}`,
      OCP_NOTES_URL: `http://127.0.0.1:${notesPort}`,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  children.push(consoleChild);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('console timeout')), 30000);
    consoleChild.stdout.on('data', (d) => {
      if (d.toString().includes('http://')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  const base = `http://127.0.0.1:${consolePort}`;
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  try {
    await page.goto(base);
    await page.getByRole('button', { name: '发布小组' }).waitFor();
    await page.getByLabel('筛选频道').fill('首页');
    await page.getByLabel('筛选频道').press('Enter');
    await page.getByRole('button', { name: '首页文案' }).waitFor();
    await page.getByRole('button', { name: '发布小组' }).waitFor({ state: 'hidden' });
    await page.getByLabel('筛选频道').fill('');
    await page.getByLabel('筛选频道').press('Enter');
    await page.getByRole('button', { name: '发布小组' }).waitFor();
    await page.getByRole('button', { name: '发布小组' }).click();
    await page.getByRole('button', { name: '首页文案' }).click();
    await page.getByText('撰写中').waitFor();
    await page.getByRole('button', { name: '接口草案' }).click();
    await page.getByText('链接把相关频道连起来').waitFor();
    const textarea = page.locator('#entry-text');
    await textarea.fill('E2E 讨论验收句');
    await page.getByRole('button', { name: '发送' }).click();
    await page.locator('#entries .entry').filter({ hasText: 'E2E 讨论验收句' }).waitFor();
    await page.getByRole('button', { name: '创建分享' }).click();
    await page.locator('.share-url').getByText(/\/s\//).waitFor();
    await page.getByRole('button', { name: '接口草案' }).click();
    await page.getByRole('button', { name: '关联' }).click();
    await page.locator('#associate-panel').getByRole('button', { name: '首页文案' }).click();
    await page.locator('#detail').getByRole('button', { name: '首页文案' }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: '接口草案' }).click();
    await page.locator('#detail').getByRole('button', { name: '首页文案' }).waitFor();
    await page.locator('#detail').getByRole('button', { name: '首页文案' }).click();
    await page.getByText('撰写中').waitFor();
    console.log('e2e: ok');
  } finally {
    await browser.close();
    for (const c of children) c.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
