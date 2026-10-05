import type { Block, Channel, Entry, Share } from './types.js';
import { blockTextContent, escapeHtml } from './util.js';
import { messagesFor, type Locale } from './uiLocale.js';

function renderBlocks(blocks: Block[], shareToken: string, publicOrigin: string): string {
  return blocks
    .map((b) => {
      if (b.type === 'text') {
        return `<p>${escapeHtml(b.text)}</p>`;
      }
      if (b.type === 'file') {
        const url = `${publicOrigin}/s/${shareToken}/files/${escapeHtml(b.file.id)}`;
        return `<p><a href="${url}">${escapeHtml(b.file.name)}</a></p>`;
      }
      if (b.type === 'embed') {
        return `<p><a href="${escapeHtml(b.embed.url)}">${escapeHtml(b.embed.title)}</a></p>`;
      }
      return '';
    })
    .join('\n');
}

export function sharePageHtml(opts: {
  channel: Channel;
  entries: Entry[];
  share: Share;
  publicOrigin: string;
  locale?: Locale;
}): string {
  const { channel, entries, share, publicOrigin } = opts;
  const t = messagesFor(opts.locale ?? 'zh');
  const bodyHtml = renderBlocks(channel.body, share.token, publicOrigin);
  const extHtml =
    channel.ext && Object.keys(channel.ext).length
      ? `<section class="ext">${Object.entries(channel.ext)
          .map(([k, v]) => `<div>${escapeHtml(k)}：${escapeHtml(String(v))}</div>`)
          .join('')}</section>`
      : '';
  const entriesHtml = entries
    .filter((e) => e.deleted_at === null)
    .map((e) => {
      const author = escapeHtml(e.author.display_name);
      const text = escapeHtml(blockTextContent(e.body));
      return `<article class="entry"><div class="author">${author}</div><div class="text">${text}</div></article>`;
    })
    .join('\n');

  const form =
    share.scope === 'comment'
      ? `<div class="comment-form">
  <textarea id="share-text" rows="3" placeholder="${escapeHtml(t.sharePlaceholder)}"></textarea>
  <button type="button" id="share-send">${escapeHtml(t.shareSend)}</button>
</div>
<script>
document.getElementById('share-send').addEventListener('click', async () => {
  const text = document.getElementById('share-text').value.trim();
  if (!text) return;
  const res = await fetch('/s/${encodeURIComponent(share.token)}/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ body: [{ type: 'text', text, format: 'plain' }] }),
  });
  if (res.ok) location.reload();
});
</script>`
      : '';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(t.htmlLang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(channel.title)}</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #f4f5f7; color: #1a1a1a; }
  main { max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; background: #fff; min-height: 100vh; box-sizing: border-box; }
  h1 { font-size: 1.5rem; margin: 0 0 16px; }
  .entry { border-top: 1px solid #e2e5ea; padding: 12px 0; }
  .author { font-size: 0.875rem; color: #5c6370; margin-bottom: 4px; }
  textarea, button { appearance: none; font: inherit; border-radius: 6px; }
  textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #c5cad3; background: #fff; margin-bottom: 8px; }
  button { padding: 8px 16px; border: 1px solid #1d4e89; background: #1d4e89; color: #fff; cursor: pointer; }
  a { color: #1d4e89; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(channel.title)}</h1>
  ${extHtml}
  <section class="body">${bodyHtml}</section>
  <section class="entries">${entriesHtml}</section>
  ${form}
</main>
</body>
</html>`;
}
