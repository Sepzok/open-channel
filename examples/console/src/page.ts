import { UI_MESSAGES, type Locale } from '../../../server/src/uiLocale.js';

export function renderPage(locale: Locale = 'zh'): string {
  const messagesJson = JSON.stringify(UI_MESSAGES).replace(/</g, '\\u003c');
  const initial = JSON.stringify(locale);
  return `<!DOCTYPE html>
<html lang="${locale === 'en' ? 'en' : 'zh-CN'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title></title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #f4f5f7; color: #1a1a1a; }
  header { background: #fff; border-bottom: 1px solid #e2e5ea; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  header h1 { margin: 0; font-size: 1.125rem; }
  .lang-switch { display: flex; gap: 4px; }
  .lang-switch button { appearance: none; font: inherit; border-radius: 6px; padding: 6px 10px; border: 1px solid #c5cad3; background: #fff; color: #1a1a1a; cursor: pointer; }
  .lang-switch button.active { border-color: #1d4e89; background: #1d4e89; color: #fff; }
  .layout { display: grid; grid-template-columns: 280px 1fr; min-height: calc(100vh - 49px); }
  aside { background: #fff; border-right: 1px solid #e2e5ea; overflow: auto; display: flex; flex-direction: column; }
  .list-filter { padding: 8px 12px; border-bottom: 1px solid #e2e5ea; flex-shrink: 0; }
  .list-filter input { width: 100%; padding: 8px 10px; border: 1px solid #c5cad3; border-radius: 6px; background: #fff; appearance: none; font: inherit; }
  #channel-list { overflow: auto; flex: 1; }
  main { background: #fff; margin: 12px; border-radius: 6px; border: 1px solid #e2e5ea; padding: 0 0 24px; }
  .channel-item { display: block; width: 100%; text-align: left; padding: 10px 12px; border: none; border-bottom: 1px solid #f0f1f3; background: #fff; cursor: pointer; appearance: none; font: inherit; }
  .channel-item:hover, .channel-item.active { background: #eef1f4; }
  .channel-item.unavailable { color: #8b919a; cursor: default; }
  .channel-meta { font-size: 0.75rem; color: #5c6370; }
  .section-band { background: #eef1f4; padding: 8px 16px; font-size: 0.8125rem; font-weight: 600; margin-top: 16px; }
  .section-body { padding: 12px 16px; }
  .body-text { white-space: pre-wrap; line-height: 1.5; }
  .entry { border-top: 1px solid #f0f1f3; padding: 8px 0; }
  .entry-author { font-size: 0.8125rem; color: #5c6370; }
  .entry-compose { margin-top: 12px; }
  textarea { width: 100%; min-height: 72px; padding: 8px 10px; border: 1px solid #c5cad3; border-radius: 6px; background: #fff; appearance: none; font: inherit; resize: vertical; }
  button, .btn { appearance: none; font: inherit; border-radius: 6px; padding: 8px 14px; border: 1px solid #1d4e89; background: #1d4e89; color: #fff; cursor: pointer; }
  button.secondary { background: #fff; color: #1d4e89; }
  .link-row { padding: 4px 0; font-size: 0.875rem; }
  .link-nav { appearance: none; font: inherit; background: none; border: none; color: #1d4e89; cursor: pointer; padding: 0; text-align: left; }
  .link-group { font-size: 0.75rem; color: #5c6370; margin: 8px 0 4px; }
  #associate-panel { margin-top: 12px; border-top: 1px solid #f0f1f3; padding-top: 8px; }
  #associate-panel .channel-item { border: 1px solid #e2e5ea; margin-bottom: 4px; border-radius: 6px; }
  .empty { color: #8b919a; padding: 24px 16px; }
  .share-url { word-break: break-all; margin-top: 8px; font-size: 0.875rem; }
  .rev-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-top: 1px solid #f0f1f3; font-size: 0.875rem; }
</style>
</head>
<body>
<header>
  <h1 id="app-title"></h1>
  <div class="lang-switch" role="group" aria-label="Language">
    <button type="button" id="lang-zh" data-lang="zh"></button>
    <button type="button" id="lang-en" data-lang="en"></button>
  </div>
</header>
<div class="layout">
  <aside>
    <div class="list-filter"><input id="channel-filter" type="search" placeholder="" aria-label=""></div>
    <div id="channel-list"><div class="empty" id="list-empty"></div></div>
  </aside>
  <main id="detail"><div class="empty" id="detail-empty"></div></main>
</div>
<script>
const MESSAGES = ${messagesJson};
const STORAGE_KEY = 'ocp-console-lang';
let locale = ${initial};
try {
  const params = new URLSearchParams(location.search);
  const q = params.get('lang');
  if (q === 'zh' || q === 'en') locale = q;
  else {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'zh' || stored === 'en') locale = stored;
  }
} catch (_) {}
let t = MESSAGES[locale];
let channels = [];
let selected = null;
let detail = null;

function applyChrome() {
  t = MESSAGES[locale];
  document.documentElement.lang = t.htmlLang;
  document.title = t.consoleTitle;
  document.getElementById('app-title').textContent = t.consoleTitle;
  const filter = document.getElementById('channel-filter');
  filter.placeholder = t.filterPlaceholder;
  filter.setAttribute('aria-label', t.filterAria);
  document.getElementById('lang-zh').textContent = t.langZh;
  document.getElementById('lang-en').textContent = t.langEn;
  document.getElementById('lang-zh').classList.toggle('active', locale === 'zh');
  document.getElementById('lang-en').classList.toggle('active', locale === 'en');
  if (!selected) {
    document.getElementById('detail').innerHTML = '<div class="empty">' + escapeHtml(t.selectChannel) + '</div>';
  }
}

function setLocale(next) {
  if (next !== 'zh' && next !== 'en') return;
  locale = next;
  try { localStorage.setItem(STORAGE_KEY, locale); } catch (_) {}
  const u = new URL(location.href);
  u.searchParams.set('lang', locale);
  history.replaceState(null, '', u);
  applyChrome();
  renderList();
  if (selected) renderDetail();
}

async function loadChannels() {
  const q = (document.getElementById('channel-filter')?.value || '').trim();
  const res = await fetch('/api/channels' + (q ? '?q=' + encodeURIComponent(q) : ''));
  const data = await res.json();
  channels = data.channels || [];
  renderList();
}

function renderList() {
  const el = document.getElementById('channel-list');
  if (!channels.length) {
    el.innerHTML = '<div class="empty">' + escapeHtml(t.noChannels) + '</div>';
    return;
  }
  el.innerHTML = channels.map((row) => {
    if (!row.providerAvailable || row.channel.type === 'unavailable') {
      return '<div class="channel-item unavailable"><div>' + escapeHtml(row.providerName) + '</div><div class="channel-meta">' +
        escapeHtml(t.sourceUnavailable) + '</div></div>';
    }
    const label = t.typeLabels[row.channel.type] || row.channel.type;
    const active = selected && selected.providerId === row.providerId && selected.channelId === row.channel.id ? ' active' : '';
    return '<button type="button" class="channel-item' + active + '" data-provider="' + row.providerId + '" data-id="' + row.channel.id + '">' +
      '<div>' + escapeHtml(row.channel.title) + '</div>' +
      '<div class="channel-meta">' + escapeHtml(row.providerName) + ' · ' + label + '</div></button>';
  }).join('');
  el.querySelectorAll('.channel-item[data-provider]').forEach((btn) => {
    btn.addEventListener('click', () => openChannel(btn.dataset.provider, btn.dataset.id));
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function openChannel(providerId, channelId) {
  selected = { providerId, channelId };
  renderList();
  const res = await fetch('/api/channels/' + providerId + '/' + channelId);
  detail = await res.json();
  renderDetail();
}

function blockText(blocks) {
  return (blocks || []).map((b) => {
    if (b.type === 'text') return b.text;
    if (b.type === 'file') return b.file?.name || '';
    if (b.type === 'embed') return b.title || b.embed?.title || '';
    return '';
  }).filter(Boolean).join('\\n');
}

function renderDetail() {
  const el = document.getElementById('detail');
  if (!detail || !detail.channel) {
    el.innerHTML = '<div class="empty">' + escapeHtml(t.readFailed) + '</div>';
    return;
  }
  const ch = detail.channel;
  const caps = detail.capabilities || {};
  let html = '';
  const ext = ch.ext && typeof ch.ext === 'object' ? ch.ext : null;
  if (ext && Object.keys(ext).length) {
    html += '<div class="section-band">' + escapeHtml(t.meta) + '</div><div class="section-body">';
    Object.keys(ext).forEach((k) => {
      html += '<div class="link-row">' + escapeHtml(k) + '：' + escapeHtml(String(ext[k])) + '</div>';
    });
    html += '</div>';
  }
  if (caps.body) {
    html += '<div class="section-band">' + escapeHtml(t.body) + '</div>';
    html += '<div class="section-body body-text">' + escapeHtml(blockText(ch.body)) + '</div>';
  }
  if (caps.entries) {
    html += '<div class="section-band">' + escapeHtml(t.entries) + '</div><div class="section-body" id="entries">';
    (detail.entries?.data || detail.entries || []).forEach((e) => {
      html += '<div class="entry"><div class="entry-author">' + escapeHtml(e.author.display_name) + '</div><div>' + escapeHtml(blockText(e.body)) + '</div></div>';
    });
    html += '<div class="entry-compose"><textarea id="entry-text" placeholder="' + escapeHtml(t.writeEntry) + '"></textarea><button type="button" id="send-entry">' +
      escapeHtml(t.send) + '</button></div></div>';
  }
  if (caps.links) {
    const out = detail.links?.data || detail.links || [];
    const children = detail.linksInParent?.data || [];
    const parents = out.filter((l) => l.type === 'parent');
    const others = out.filter((l) => l.type !== 'parent');
    const hasAny = parents.length || children.length || others.length;
    html += '<div class="section-band">' + escapeHtml(t.links) + '</div><div class="section-body">';
    if (!hasAny) html += '<div class="empty">' + escapeHtml(t.noLinks) + '</div>';
    function linkRow(l, fallback) {
      const text = escapeHtml(fallback(l));
      if (l.resolved && l.resolved.providerId && l.resolved.channelId) {
        return '<div class="link-row"><button type="button" class="link-nav" data-provider="' +
          escapeHtml(l.resolved.providerId) + '" data-id="' + escapeHtml(l.resolved.channelId) + '">' + text + '</button></div>';
      }
      if (l.target_url) {
        return '<div class="link-row">' + escapeHtml(l.title || l.target_url) + '</div>';
      }
      return '<div class="link-row">' + text + '</div>';
    }
    if (parents.length) {
      html += '<div class="link-group">' + escapeHtml(t.parents) + '</div>' + parents.map((l) => linkRow(l, (x) => x.title || x.target_id || x.type)).join('');
    }
    if (children.length) {
      html += '<div class="link-group">' + escapeHtml(t.children) + '</div>' + children.map((l) => linkRow(l, (x) => x.label || x.title || x.source_id)).join('');
    }
    if (others.length) {
      html += '<div class="link-group">' + escapeHtml(t.others) + '</div>' + others.map((l) => linkRow(l, (x) => x.title || x.type)).join('');
    }
    html += '<button type="button" class="secondary" id="associate-open">' + escapeHtml(t.associate) + '</button>';
    html += '<div id="associate-panel" hidden></div>';
    html += '</div>';
  }
  if (caps.revisions && detail.revisions) {
    html += '<div class="section-band">' + escapeHtml(t.revisions) + '</div><div class="section-body" id="revisions">';
    (detail.revisions.data || []).forEach((r) => {
      html += '<div class="rev-row"><span>' + escapeHtml(r.id) + '</span><button type="button" class="secondary restore-rev" data-rev="' + r.id + '">' +
        escapeHtml(t.restore) + '</button></div>';
    });
    html += '</div>';
  }
  if (caps.shares) {
    html += '<div class="section-band">' + escapeHtml(t.shares) + '</div><div class="section-body"><button type="button" id="create-share">' +
      escapeHtml(t.createShare) + '</button><div class="share-url" id="share-url"></div></div>';
  }
  el.innerHTML = html;
  document.getElementById('send-entry')?.addEventListener('click', sendEntry);
  document.getElementById('create-share')?.addEventListener('click', createShare);
  document.getElementById('associate-open')?.addEventListener('click', openAssociate);
  document.querySelectorAll('.link-nav').forEach((btn) => {
    btn.addEventListener('click', () => openChannel(btn.dataset.provider, btn.dataset.id));
  });
  document.querySelectorAll('.restore-rev').forEach((btn) => {
    btn.addEventListener('click', () => restoreRev(btn.dataset.rev));
  });
}

async function sendEntry() {
  const text = document.getElementById('entry-text').value.trim();
  if (!text || !selected) return;
  await fetch('/api/channels/' + selected.providerId + '/' + selected.channelId + '/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  await openChannel(selected.providerId, selected.channelId);
}

async function associateTo(providerId, channelId, title) {
  if (!selected) return;
  await fetch('/api/channels/' + selected.providerId + '/' + selected.channelId + '/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId, channelId, title }),
  });
  await openChannel(selected.providerId, selected.channelId);
}

function openAssociate() {
  const panel = document.getElementById('associate-panel');
  if (!panel || !selected) return;
  const choices = channels.filter((row) => row.providerAvailable && !(row.providerId === selected.providerId && row.channel.id === selected.channelId));
  if (!choices.length) {
    panel.hidden = false;
    panel.innerHTML = '<div class="empty">' + escapeHtml(t.noAssociate) + '</div>';
    return;
  }
  panel.hidden = false;
  panel.innerHTML = choices.map((row) => {
    const label = t.typeLabels[row.channel.type] || row.channel.type;
    return '<button type="button" class="channel-item" data-provider="' + row.providerId + '" data-id="' + row.channel.id + '" data-title="' + encodeURIComponent(row.channel.title) + '">' +
      '<div>' + escapeHtml(row.channel.title) + '</div>' +
      '<div class="channel-meta">' + escapeHtml(row.providerName) + ' · ' + label + '</div></button>';
  }).join('');
  panel.querySelectorAll('.channel-item').forEach((btn) => {
    btn.addEventListener('click', () => associateTo(btn.dataset.provider, btn.dataset.id, decodeURIComponent(btn.dataset.title)));
  });
}

async function createShare() {
  if (!selected) return;
  const res = await fetch('/api/channels/' + selected.providerId + '/' + selected.channelId + '/shares', { method: 'POST' });
  const data = await res.json();
  document.getElementById('share-url').textContent = data.url || '';
}

async function restoreRev(revId) {
  if (!selected) return;
  await fetch('/api/channels/' + selected.providerId + '/' + selected.channelId + '/revisions/' + revId + '/restore', { method: 'POST' });
  await openChannel(selected.providerId, selected.channelId);
}

document.getElementById('lang-zh').addEventListener('click', () => setLocale('zh'));
document.getElementById('lang-en').addEventListener('click', () => setLocale('en'));
applyChrome();
loadChannels();
document.getElementById('channel-filter').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadChannels();
});
</script>
</body>
</html>`;
}
