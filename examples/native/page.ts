type TicketChannel = {
  id: string;
  title: string;
  ext?: { native_id?: string };
};

type TicketEntry = {
  author: { display_name: string };
  body: { type: string; text?: string }[];
};

const COPY = {
  zh: {
    htmlLang: 'zh-CN',
    brand: '工单适配',
    ticketId: '工单号',
    comments: '评论',
    langZh: '中文',
    langEn: 'English',
  },
  en: {
    htmlLang: 'en',
    brand: 'Ticket adapter',
    ticketId: 'Ticket',
    comments: 'Comments',
    langZh: '中文',
    langEn: 'English',
  },
};

const TEXT_EN: Record<string, string> = {
  验收清单: 'Acceptance list',
  融合台: 'Fusion Console',
  '先对协议再写适配。': 'Match the protocol first, then write the adapter.',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

function show(text: string, locale: 'zh' | 'en'): string {
  if (locale === 'zh') return text;
  return TEXT_EN[text] ?? text;
}

export function renderTicketPage(opts: {
  locale: 'zh' | 'en';
  channel: TicketChannel;
  entries: TicketEntry[];
}): string {
  const { locale, channel, entries } = opts;
  const t = COPY[locale];
  const title = show(channel.title, locale);
  const comments = entries
    .map((e) => {
      const text = e.body.map((b) => (b.type === 'text' ? show(b.text ?? '', locale) : '')).join('');
      return `<article class="comment"><div class="author">${escapeHtml(show(e.author.display_name, locale))}</div><div>${escapeHtml(text)}</div></article>`;
    })
    .join('\n');
  return `<!DOCTYPE html>
<html lang="${escapeHtml(t.htmlLang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(t.brand)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #f3f4f6; color: #1a1a1a; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; background: #fff; border-bottom: 1px solid #e5e7eb; }
  .brand { font-weight: 700; }
  button { appearance: none; font: inherit; border-radius: 8px; cursor: pointer; padding: 6px 10px; border: 1px solid #c5cad3; background: #fff; }
  button.active { background: #1d4e89; color: #fff; border-color: #1d4e89; }
  .ticket { max-width: 720px; margin: 32px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 28px 32px 40px; }
  .key { font-size: 0.8rem; color: #6b7280; }
  .native-id { font-family: ui-monospace, monospace; font-size: 0.95rem; color: #1d4e89; }
  h1 { margin: 8px 0 20px; }
  .comment { border-top: 1px solid #eef1f4; padding: 10px 0; }
  .author { font-size: 0.8rem; color: #6b7280; }
</style>
</head>
<body>
<header>
  <div class="brand">${escapeHtml(t.brand)}</div>
  <div>
    <button type="button" class="${locale === 'zh' ? 'active' : ''}" onclick="location.search='?lang=zh'">${escapeHtml(t.langZh)}</button>
    <button type="button" class="${locale === 'en' ? 'active' : ''}" onclick="location.search='?lang=en'">${escapeHtml(t.langEn)}</button>
  </div>
</header>
<main class="ticket">
  <div class="key">${escapeHtml(t.ticketId)}</div>
  <div class="native-id">${escapeHtml(String(channel.ext?.native_id ?? ''))}</div>
  <h1>${escapeHtml(title)}</h1>
  <h2>${escapeHtml(t.comments)}</h2>
  ${comments}
</main>
</body>
</html>`;
}
