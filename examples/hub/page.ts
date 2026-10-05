import type { Locale } from '@open-channel/server';

type TargetView = {
  id: string;
  url: string;
  genreZh: string;
  genreEn: string;
  titleZh: string;
  titleEn: string;
  blurbZh: string;
  blurbEn: string;
};

const COPY = {
  zh: {
    htmlLang: 'zh-CN',
    brand: 'Open Channel',
    headline: '本地例子入口',
    lead: '选一个品类打开对应进程的展示页。融合台用来同时看三个来源。',
    open: '打开',
    up: '已启动',
    down: '未启动',
    checking: '检测中…',
    langZh: '中文',
    langEn: 'English',
  },
  en: {
    htmlLang: 'en',
    brand: 'Open Channel',
    headline: 'Local examples',
    lead: 'Open a genre surface on its process. The fusion console reads three origins together.',
    open: 'Open',
    up: 'Running',
    down: 'Not running',
    checking: 'Checking…',
    langZh: '中文',
    langEn: 'English',
  },
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

export function renderHubPage(opts: { locale: Locale; targets: TargetView[] }): string {
  const { locale, targets } = opts;
  const t = COPY[locale];
  const targetsJson = JSON.stringify(targets).replace(/</g, '\\u003c');
  const rows = targets
    .map((row) => {
      const title = locale === 'zh' ? row.titleZh : row.titleEn;
      const genre = locale === 'zh' ? row.genreZh : row.genreEn;
      const blurb = locale === 'zh' ? row.blurbZh : row.blurbEn;
      return `<a class="dest" data-id="${escapeHtml(row.id)}" href="${escapeHtml(row.url)}">
  <div class="dest-top">
    <span class="genre">${escapeHtml(genre)}</span>
    <span class="status" data-status="${escapeHtml(row.id)}">${escapeHtml(t.checking)}</span>
  </div>
  <div class="dest-title">${escapeHtml(title)}</div>
  <p class="dest-blurb">${escapeHtml(blurb)}</p>
  <span class="dest-open">${escapeHtml(t.open)}</span>
</a>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(t.htmlLang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(t.brand)} · ${escapeHtml(t.headline)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Songti SC", serif;
    color: #15202b;
    background:
      radial-gradient(1200px 600px at 10% -10%, #d9e7f5 0%, transparent 55%),
      radial-gradient(900px 500px at 100% 0%, #e7f0e8 0%, transparent 50%),
      #f3f6f8;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 28px 28px 8px;
    max-width: 960px;
    margin: 0 auto;
  }
  .brand {
    font-size: clamp(2rem, 5vw, 2.75rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }
  .lang-switch { display: flex; gap: 6px; }
  .lang-switch button {
    appearance: none;
    font: inherit;
    font-family: system-ui, sans-serif;
    font-size: 0.875rem;
    border-radius: 8px;
    padding: 6px 12px;
    border: 1px solid #b8c2ce;
    background: rgba(255,255,255,0.85);
    color: #15202b;
    cursor: pointer;
  }
  .lang-switch button.active {
    border-color: #1d4e89;
    background: #1d4e89;
    color: #fff;
  }
  .hero {
    max-width: 960px;
    margin: 0 auto;
    padding: 8px 28px 28px;
  }
  .hero h1 {
    margin: 0 0 10px;
    font-size: 1.25rem;
    font-weight: 600;
    font-family: system-ui, sans-serif;
  }
  .hero p {
    margin: 0;
    max-width: 36rem;
    font-family: system-ui, sans-serif;
    font-size: 1rem;
    line-height: 1.5;
    color: #3f4a57;
  }
  .grid {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 28px 48px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 14px;
  }
  .dest {
    display: block;
    text-decoration: none;
    color: inherit;
    background: rgba(255,255,255,0.92);
    border: 1px solid #d5dee8;
    border-radius: 14px;
    padding: 16px 16px 14px;
    transition: border-color 120ms ease, transform 120ms ease;
  }
  .dest:hover { border-color: #1d4e89; transform: translateY(-1px); }
  .dest-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-family: system-ui, sans-serif;
  }
  .genre {
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    color: #1d4e89;
    font-weight: 600;
  }
  .status {
    font-size: 0.75rem;
    color: #667085;
  }
  .status.up { color: #1f6b3a; }
  .status.down { color: #9a3412; }
  .dest-title {
    font-family: system-ui, sans-serif;
    font-size: 1.125rem;
    font-weight: 650;
    margin-bottom: 6px;
  }
  .dest-blurb {
    margin: 0 0 14px;
    font-family: system-ui, sans-serif;
    font-size: 0.9rem;
    line-height: 1.45;
    color: #5c6370;
    min-height: 2.6em;
  }
  .dest-open {
    font-family: system-ui, sans-serif;
    font-size: 0.875rem;
    color: #1d4e89;
    font-weight: 600;
  }
</style>
</head>
<body>
<header>
  <div class="brand">${escapeHtml(t.brand)}</div>
  <div class="lang-switch" role="group" aria-label="Language">
    <button type="button" id="lang-zh" class="${locale === 'zh' ? 'active' : ''}">${escapeHtml(t.langZh)}</button>
    <button type="button" id="lang-en" class="${locale === 'en' ? 'active' : ''}">${escapeHtml(t.langEn)}</button>
  </div>
</header>
<section class="hero">
  <h1>${escapeHtml(t.headline)}</h1>
  <p>${escapeHtml(t.lead)}</p>
</section>
<nav class="grid" aria-label="${escapeHtml(t.headline)}">
${rows}
</nav>
<script>
const LOCALE = ${JSON.stringify(locale)};
const COPY = ${JSON.stringify(t).replace(/</g, '\\u003c')};
const TARGETS = ${targetsJson};
document.getElementById('lang-zh').onclick = () => {
  const u = new URL(location.href); u.searchParams.set('lang', 'zh'); location.href = u;
};
document.getElementById('lang-en').onclick = () => {
  const u = new URL(location.href); u.searchParams.set('lang', 'en'); location.href = u;
};
async function refreshStatus() {
  try {
    const res = await fetch('/api/status', { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const data = await res.json();
    for (const row of data.targets || []) {
      const el = document.querySelector('[data-status="' + row.id + '"]');
      if (!el) continue;
      el.textContent = row.ok ? COPY.up : COPY.down;
      el.classList.toggle('up', !!row.ok);
      el.classList.toggle('down', !row.ok);
    }
  } catch (_) {}
}
void refreshStatus();
void TARGETS;
</script>
</body>
</html>`;
}
