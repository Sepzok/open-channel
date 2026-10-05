#!/usr/bin/env node
/**
 * Build static GitHub Pages demos under site/.
 * State at runtime is browser-only (pages/runtime/ocp-demo.js).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSurfaceSnapshot,
  renderSurfacePage,
  resolveLocale,
} from '@open-channel/server';
import { Store } from '../server/src/store.js';
import { renderWalkPage } from '../examples/walk/page.js';
import { renderTicketPage } from '../examples/native/page.js';
import { renderPage as renderConsolePage } from '../examples/console/src/page.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, '..');
const siteDir = path.join(repo, 'site');
const runtimeSrc = path.join(repo, 'pages', 'runtime');

function rimraf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function write(file, contents) {
  // Legacy GitHub Pages may still parse Liquid even with .nojekyll in some failure modes.
  if (/\{\{|\{%/.test(contents)) {
    throw new Error(`Pages output must not contain Liquid markers: ${file}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

async function seededSnapshot(options) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocp-pages-'));
  const store = new Store({ ...options, dataDir });
  await store.init();
  const snapshot = buildSurfaceSnapshot(store, options);
  rimraf(dataDir);
  return snapshot;
}

function copyRuntime() {
  const dest = path.join(siteDir, 'runtime');
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(runtimeSrc)) {
    if (name.endsWith('.test.mjs') || name.endsWith('.test.js')) continue;
    fs.copyFileSync(path.join(runtimeSrc, name), path.join(dest, name));
  }
}

const PROVIDERS = {
  chat: {
    dir: 'chat',
    providerId: 'chat',
    providerName: '示例会话',
    surface: 'chat',
    capabilities: {
      body: false,
      entries: true,
      entry_threads: true,
      links: true,
      shares: true,
      revisions: false,
      live: false,
    },
  },
  tasks: {
    dir: 'tasks',
    providerId: 'tasks',
    providerName: '示例任务',
    surface: 'tasks',
    capabilities: {
      body: true,
      entries: true,
      entry_threads: false,
      links: true,
      shares: true,
      revisions: true,
      live: false,
    },
  },
  notes: {
    dir: 'notes',
    providerId: 'notes',
    providerName: '示例笔记',
    surface: 'notes',
    capabilities: {
      body: true,
      entries: true,
      entry_threads: false,
      links: true,
      shares: true,
      revisions: true,
      live: false,
    },
  },
  walk: {
    dir: 'walk',
    providerId: 'walk',
    providerName: '对局房间',
    surface: null,
    capabilities: {
      body: false,
      entries: true,
      entry_threads: false,
      links: false,
      shares: false,
      revisions: false,
      live: true,
    },
  },
};

async function buildSurface(key, locale) {
  const meta = PROVIDERS[key];
  const seedPath = path.join(repo, 'examples', meta.dir, 'seed.json');
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const options = {
    providerId: meta.providerId,
    providerName: meta.providerName,
    capabilities: meta.capabilities,
    actor: { id: 'u_fuse', display_name: '融合台' },
    token: 'demo-token',
    seed,
    dataDir: '/tmp/unused',
    publicOrigin: 'http://127.0.0.1',
    surface: meta.surface,
  };
  const snapshot = await seededSnapshot(options);
  if (key === 'walk') {
    return renderWalkPage({
      locale,
      snapshot,
      demoRuntimeSrc: '../runtime/ocp-demo.js',
      walkDemoSrc: '../runtime/walk-demo.js',
    });
  }
  return renderSurfacePage({
    kind: meta.surface,
    locale,
    snapshot,
    demoRuntimeSrc: '../runtime/ocp-demo.js',
  });
}

function buildTicket(locale) {
  return renderTicketPage({
    locale,
    channel: {
      id: 'ch_accept',
      title: '验收清单',
      ext: { native_id: 'T-100' },
    },
    entries: [
      {
        author: { display_name: '融合台' },
        body: [{ type: 'text', text: '先对协议再写适配。' }],
      },
    ],
  });
}

function injectConsoleDemo(html, bundlesJson) {
  const boot = `<script>window.OCP_DEMO_BUNDLES = ${bundlesJson};</script>
<script src="../runtime/ocp-demo.js"></script>
`;
  return html.replace('<body>', `<body>\n${boot}`);
}

function buildHub() {
  const cards = [
    { href: 'chat/', titleZh: '示例会话', titleEn: 'Sample chat', blurbZh: '列表与气泡，可登录发消息', blurbEn: 'List and bubbles — sign in and send' },
    { href: 'tasks/', titleZh: '示例任务', titleEn: 'Sample tasks', blurbZh: '项目与任务评论', blurbEn: 'Projects and task comments' },
    { href: 'notes/', titleZh: '示例笔记', titleEn: 'Sample notes', blurbZh: '文稿与批注', blurbEn: 'Document and annotations' },
    { href: 'ticket/', titleZh: '工单适配', titleEn: 'Ticket adapter', blurbZh: '独立适配展示', blurbEn: 'Standalone adapter showcase' },
    { href: 'walk/', titleZh: '走动房间', titleEn: 'Walk room', blurbZh: '页内对局，方向键走动', blurbEn: 'In-page match — arrow keys to walk' },
    { href: 'console/', titleZh: '融合台', titleEn: 'Fusion console', blurbZh: '三源频道一览', blurbEn: 'Three providers in one view' },
  ];
  const cardHtml = cards
    .map(
      (c) => `<a class="card" href="${c.href}">
  <strong data-zh="${c.titleZh}" data-en="${c.titleEn}">${c.titleZh}</strong>
  <span class="blurb" data-zh="${c.blurbZh}" data-en="${c.blurbEn}">${c.blurbZh}</span>
</a>`,
    )
    .join('\n');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Open Channel</title>
<meta name="description" content="OCP 浏览器内静态演示。状态留在本机浏览器，不是公网 API。">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; color: #15202b;
    font-family: system-ui, sans-serif;
    background:
      radial-gradient(1200px 600px at 10% -10%, #d9e7f5 0%, transparent 55%),
      radial-gradient(900px 500px at 100% 0%, #e7f0e8 0%, transparent 50%),
      #f3f6f8;
  }
  header, main { max-width: 42rem; margin: 0 auto; padding: 0 1.5rem; }
  header { display: flex; justify-content: space-between; align-items: flex-start; padding-top: 2.5rem; }
  .brand { font-family: "Iowan Old Style", Palatino, "Songti SC", serif; font-size: clamp(1.75rem, 5vw, 2.4rem); font-weight: 700; letter-spacing: -0.03em; }
  .lang-switch { display: flex; gap: 6px; }
  .lang-switch button {
    appearance: none; font: inherit; font-size: 0.875rem; border-radius: 8px; padding: 6px 12px;
    border: 1px solid #b8c2ce; background: rgba(255,255,255,0.85); cursor: pointer;
  }
  .lang-switch button.active { border-color: #1d4e89; background: #1d4e89; color: #fff; }
  h1 { font-size: 1.15rem; font-weight: 600; margin: 1.5rem 0 0.5rem; }
  .lead { color: #3f4a57; line-height: 1.55; margin: 0 0 1.25rem; }
  .card {
    display: block; text-decoration: none; color: inherit; background: #fff;
    border: 1px solid #d5dee8; border-radius: 12px; padding: 1rem 1.1rem; margin: 0.65rem 0;
  }
  .card:hover { border-color: #1d4e89; }
  .card strong { display: block; margin-bottom: 0.25rem; }
  .blurb { color: #5c6370; font-size: 0.9rem; }
  .note { margin: 2rem 0 3rem; font-size: 0.9rem; color: #5c6370; }
  .note a { color: #1d4e89; }
  pre {
    font-family: ui-monospace, Menlo, monospace; font-size: 0.85rem; background: #fff;
    border: 1px solid #d5dee8; border-radius: 10px; padding: 12px 14px; overflow: auto;
  }
</style>
</head>
<body>
<header>
  <div class="brand">Open Channel</div>
  <div class="lang-switch" role="group">
    <button type="button" id="lang-zh" class="active">中文</button>
    <button type="button" id="lang-en">English</button>
  </div>
</header>
<main>
  <h1 id="headline">浏览器内演示</h1>
  <p class="lead" id="lead">点开各品类例子即可体验。状态只在本机浏览器；完整协议与对局请本机运行仓库。</p>
${cardHtml}
  <p class="note" id="note">源码与协议：<a href="https://github.com/Sepzok/open-channel">GitHub</a></p>
  <pre id="cmd">git clone https://github.com/Sepzok/open-channel.git
cd open-channel
npm install
npm run dev</pre>
</main>
<script>
const COPY = {
  zh: {
    headline: '浏览器内演示',
    lead: '点开各品类例子即可体验。状态只在本机浏览器；完整协议与对局请本机运行仓库。',
    note: '源码与协议：'
  },
  en: {
    headline: 'In-browser demos',
    lead: 'Open each genre example to try it. State stays in your browser; run the repo locally for the full protocol and match.',
    note: 'Source and specification: '
  }
};
function apply(locale) {
  const t = COPY[locale];
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
  document.getElementById('headline').textContent = t.headline;
  document.getElementById('lead').textContent = t.lead;
  document.querySelectorAll('[data-zh]').forEach((el) => {
    el.textContent = locale === 'en' ? el.getAttribute('data-en') : el.getAttribute('data-zh');
  });
  const note = document.getElementById('note');
  note.childNodes[0].textContent = t.note;
  document.getElementById('lang-zh').classList.toggle('active', locale === 'zh');
  document.getElementById('lang-en').classList.toggle('active', locale === 'en');
}
document.getElementById('lang-zh').onclick = () => apply('zh');
document.getElementById('lang-en').onclick = () => apply('en');
</script>
</body>
</html>`;
}

async function main() {
  rimraf(siteDir);
  fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, '.nojekyll'), '');
  copyRuntime();

  const locale = resolveLocale({ queryLang: 'zh' });
  write(path.join(siteDir, 'index.html'), buildHub());

  for (const key of ['chat', 'tasks', 'notes', 'walk']) {
    const html = await buildSurface(key, locale);
    write(path.join(siteDir, PROVIDERS[key].dir, 'index.html'), html);
  }

  write(path.join(siteDir, 'ticket', 'index.html'), buildTicket(locale));

  const bundles = {};
  for (const key of ['chat', 'tasks', 'notes']) {
    const meta = PROVIDERS[key];
    const seed = JSON.parse(fs.readFileSync(path.join(repo, 'examples', meta.dir, 'seed.json'), 'utf8'));
    const options = {
      providerId: meta.providerId,
      providerName: meta.providerName,
      capabilities: meta.capabilities,
      actor: { id: 'u_fuse', display_name: '融合台' },
      token: 'demo-token',
      seed,
      dataDir: '/tmp/unused',
      publicOrigin: 'http://127.0.0.1',
      surface: meta.surface,
    };
    const snapshot = await seededSnapshot(options);
    bundles[key] = { snapshot, capabilities: meta.capabilities };
  }
  const consoleHtml = injectConsoleDemo(
    renderConsolePage(locale),
    JSON.stringify(bundles).replace(/</g, '\\u003c'),
  );
  write(path.join(siteDir, 'console', 'index.html'), consoleHtml);

  console.log('Wrote Pages demos to', siteDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
