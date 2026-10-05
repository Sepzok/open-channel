import fs from 'node:fs';
import path from 'node:path';
import type { Store } from './store.js';
import type { AppOptions, Block, SurfaceKind } from './types.js';
import { escapeHtml } from './util.js';
import {
  displayChannelTitle,
  displaySeedText,
  messagesFor,
  SEED_CHANNEL_TITLES,
  SEED_TEXT_EN,
  type Locale,
} from './uiLocale.js';

export type SurfaceSnapshot = {
  provider: { id: string; name: string };
  kind: SurfaceKind | 'custom';
  accounts: { id: string; display_name: string }[];
  channels: {
    id: string;
    type: string;
    title: string;
    body: Block[];
    ext?: Record<string, string | number | boolean>;
    members: { id: string; display_name: string }[];
  }[];
  entries: {
    id: string;
    channel_id: string;
    type: string;
    body: Block[];
    parent_id: string | null;
    anchor: { block_id: string; quote?: string } | null;
    author: { id: string; display_name: string };
    created_at: string;
  }[];
  links: {
    id: string;
    type: string;
    source_id: string;
    target_id?: string;
    target_url?: string;
    title?: string;
  }[];
  revisions: { id: string; channel_id: string; title: string; created_at: string }[];
  files: { id: string; name: string; text: string | null }[];
};

export function buildSurfaceSnapshot(store: Store, options: AppOptions): SurfaceSnapshot {
  const files = Object.values(store.data.files).map((f) => {
    let text: string | null = null;
    if (f.media_type.startsWith('text/')) {
      try {
        text = fs.readFileSync(path.join(store.filesDir, f.id), 'utf8');
      } catch {
        text = null;
      }
    }
    return { id: f.id, name: f.name, text };
  });
  return {
    provider: { id: options.providerId, name: options.providerName },
    kind: options.surface ?? 'custom',
    accounts: Object.values(store.data.accounts).map((a) => ({
      id: a.id,
      display_name: a.display_name,
    })),
    channels: Object.values(store.data.channels)
      .filter((c) => c.deleted_at === null)
      .map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        body: c.body,
        ext: c.ext,
        members: c.members.map((m) => ({ id: m.id, display_name: m.display_name })),
      })),
    entries: Object.values(store.data.entries)
      .filter((e) => e.deleted_at === null)
      .map((e) => ({
        id: e.id,
        channel_id: e.channel_id,
        type: e.type,
        body: e.body,
        parent_id: e.parent_id,
        anchor: e.anchor,
        author: e.author,
        created_at: e.created_at,
      })),
    links: Object.values(store.data.links)
      .filter((l) => l.deleted_at === null)
      .map((l) => ({
        id: l.id,
        type: l.type,
        source_id: l.source_id,
        target_id: l.target_id,
        target_url: l.target_url,
        title: l.title,
      })),
    revisions: Object.values(store.data.revisions).map((r) => ({
      id: r.id,
      channel_id: r.channel_id,
      title: r.title,
      created_at: r.created_at,
    })),
    files,
  };
}

function seedTitlesInHtml(snapshot: SurfaceSnapshot, locale: Locale): string {
  return snapshot.channels
    .map((c) => escapeHtml(displayChannelTitle(c.id, c.title, locale)))
    .join(' ');
}

export function renderSurfacePage(opts: {
  kind: SurfaceKind;
  locale: Locale;
  snapshot: SurfaceSnapshot;
}): string {
  const { kind, locale, snapshot } = opts;
  const t = messagesFor(locale);
  const title = displaySeedText(snapshot.provider.name, locale);
  const snapshotJson = JSON.stringify(snapshot).replace(/</g, '\\u003c');
  const messagesJson = JSON.stringify(t).replace(/</g, '\\u003c');
  const seedTextJson = JSON.stringify(SEED_TEXT_EN).replace(/</g, '\\u003c');
  const seedTitlesJson = JSON.stringify(SEED_CHANNEL_TITLES).replace(/</g, '\\u003c');
  const titlesHint = seedTitlesInHtml(snapshot, locale);
  return `<!DOCTYPE html>
<html lang="${escapeHtml(t.htmlLang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${surfaceCss(kind)}</style>
</head>
<body class="surface surface-${escapeHtml(kind)}">
<header class="top">
  <div class="brand">${escapeHtml(title)}</div>
  <div class="top-actions">
    <div class="lang-switch" role="group">
      <button type="button" id="lang-zh" data-lang="zh">${escapeHtml(t.langZh)}</button>
      <button type="button" id="lang-en" data-lang="en">${escapeHtml(t.langEn)}</button>
    </div>
  </div>
</header>
<div id="app" class="app app-${escapeHtml(kind)}"></div>
<div class="sr-only">${titlesHint}</div>
<script>
const KIND = ${JSON.stringify(kind)};
const INITIAL_LOCALE = ${JSON.stringify(locale)};
const T0 = ${messagesJson};
const SEED_TEXT = ${seedTextJson};
const SEED_TITLES_FULL = ${seedTitlesJson};
let SNAPSHOT = ${snapshotJson};
${surfaceClientJs()}
</script>
</body>
</html>`;
}

function surfaceCss(kind: SurfaceKind): string {
  const shared = `
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; color: #1a1a1a; }
button, textarea, input { appearance: none; -webkit-appearance: none; font: inherit; }
button { cursor: pointer; border-radius: 8px; }
textarea { border-radius: 8px; border: 1px solid #c5cad3; background: #fff; padding: 8px 10px; width: 100%; resize: vertical; }
.top { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; }
.brand { font-weight: 700; letter-spacing: 0.02em; }
.lang-switch { display: flex; gap: 4px; }
.lang-switch button { padding: 6px 10px; border: 1px solid #c5cad3; background: #fff; }
.lang-switch button.active { border-color: #1d4e89; background: #1d4e89; color: #fff; }
.who { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.who button { padding: 6px 10px; border: 1px solid #c5cad3; background: #fff; }
.who button.on { border-color: #1d4e89; background: #e8eef6; }
.app { display: grid; min-height: calc(100vh - 52px); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.empty { color: #6b7280; padding: 24px; }
`;
  if (kind === 'chat') {
    return shared + `
body.surface-chat { background: linear-gradient(180deg, #d7e3f4 0%, #eef3f8 40%, #f4f6f8 100%); }
.surface-chat .top { background: rgba(255,255,255,0.72); border-bottom: 1px solid #d5deea; }
.app-chat { grid-template-columns: 280px 1fr; }
.im-list { background: #f7f9fc; border-right: 1px solid #d5deea; overflow: auto; }
.im-item { display: block; width: 100%; text-align: left; padding: 12px 14px; border: none; border-bottom: 1px solid #edf1f6; background: transparent; border-radius: 0; }
.im-item .name { font-weight: 600; }
.im-item .preview { font-size: 0.8rem; color: #667085; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.im-item.active { background: #fff; }
.im-thread { display: flex; flex-direction: column; background: #e8eef5; }
.im-head { padding: 12px 16px; background: #fff; border-bottom: 1px solid #d5deea; font-weight: 600; }
.im-bubbles { flex: 1; overflow: auto; padding: 16px 18px 8px; }
.im-bubble { max-width: 72%; padding: 8px 12px; border-radius: 16px; margin: 6px 0; clear: both; }
.im-bubble .author { font-size: 0.7rem; color: #5c6370; margin-bottom: 2px; }
.im-bubble.them { background: #fff; float: left; border-bottom-left-radius: 4px; }
.im-bubble.me { background: #95ec69; float: right; border-bottom-right-radius: 4px; }
.im-bubble.child { margin-left: 28px; max-width: 64%; }
.im-compose { flex-shrink: 0; padding: 10px 12px 16px; background: #fff; display: flex; gap: 8px; }
.im-compose textarea { min-height: 44px; }
.im-compose button { padding: 8px 16px; border: 1px solid #1d4e89; background: #1d4e89; color: #fff; white-space: nowrap; }
`;
  }
  if (kind === 'tasks') {
    return shared + `
body.surface-tasks { background: #eef1f4; }
.surface-tasks .top { background: #fff; border-bottom: 1px solid #e2e5ea; }
.app-tasks { grid-template-columns: 240px 1fr; }
.pm-nav { background: #fff; border-right: 1px solid #e2e5ea; overflow: auto; }
.pm-nav h2 { margin: 0; padding: 10px 14px; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; color: #667085; background: #f4f6f8; }
.pm-item { display: block; width: 100%; text-align: left; padding: 10px 14px; border: none; border-bottom: 1px solid #f0f1f3; background: #fff; border-radius: 0; }
.pm-item.active { box-shadow: inset 3px 0 0 #1d4e89; background: #f7f9fc; }
.pm-item .meta { font-size: 0.75rem; color: #667085; }
.pm-main { padding: 20px 24px 40px; overflow: auto; }
.pm-hero h1 { margin: 0 0 8px; font-size: 1.5rem; }
.pm-hero p { margin: 0 0 16px; color: #3f4a57; line-height: 1.5; }
.pm-task { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: start; padding: 12px 0; border-top: 1px solid #e2e5ea; }
.chip { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #e8eef6; color: #1d4e89; font-size: 0.75rem; }
.pm-comments { margin-top: 20px; }
.pm-comments h2 { font-size: 0.9rem; margin: 0 0 8px; }
.pm-comment { padding: 8px 0; border-top: 1px solid #eef1f4; }
.pm-comment .author { font-size: 0.8rem; color: #667085; }
.pm-compose { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; max-width: 560px; }
.pm-compose button { align-self: flex-start; padding: 8px 16px; border: 1px solid #1d4e89; background: #1d4e89; color: #fff; }
`;
  }
  return shared + `
body.surface-notes { background: #eceff3; }
.surface-notes .top { background: #fff; border-bottom: 1px solid #e2e5ea; }
.app-notes { grid-template-columns: 220px 1fr; }
.doc-nav { background: #f7f8fa; border-right: 1px solid #e2e5ea; overflow: auto; }
.doc-nav h2 { margin: 0; padding: 10px 14px; font-size: 0.75rem; color: #667085; }
.doc-item { display: block; width: 100%; text-align: left; padding: 10px 14px; border: none; background: transparent; border-radius: 0; }
.doc-item.active { background: #fff; font-weight: 600; }
.doc-paper { max-width: 720px; margin: 24px auto; background: #fff; padding: 40px 48px 64px; min-height: 70vh; box-shadow: 0 1px 2px rgba(16,24,40,0.06); }
.doc-paper h1 { margin: 0 0 20px; font-size: 2rem; line-height: 1.2; }
.doc-paper .body p { font-size: 1.05rem; line-height: 1.7; margin: 0 0 12px; }
.ann-mark { background: #fff3bf; padding: 0 2px; }
.doc-file { font-size: 0.9rem; padding: 8px 10px; background: #f4f6f8; border-radius: 6px; margin: 8px 0; white-space: pre-wrap; }
.doc-aside { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eef1f4; }
.doc-aside h2 { font-size: 0.85rem; color: #667085; margin: 16px 0 8px; }
.ann { font-size: 0.9rem; padding: 8px 0; }
.ann .quote { color: #8a6d00; font-size: 0.8rem; }
.doc-compose { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.doc-compose button { align-self: flex-start; padding: 8px 16px; border: 1px solid #1d4e89; background: #1d4e89; color: #fff; }
.doc-link { color: #1d4e89; background: none; border: none; padding: 0; font: inherit; cursor: pointer; }
`;
}

function surfaceClientJs(): string {
  return `
const STORAGE_KEY = 'ocp-surface-lang';
let locale = INITIAL_LOCALE;
let t = T0;
let selectedId = SNAPSHOT.channels[0] ? SNAPSHOT.channels[0].id : null;
let sessionToken = null;
let sessionActor = null;

function displayText(s) {
  if (locale === 'zh' || !s) return s;
  if (SEED_TEXT[s]) return SEED_TEXT[s];
  return s;
}
function channelTitle(c) {
  if (locale === 'zh') return c.title;
  const row = SEED_TITLES_FULL[c.id];
  if (row) return row.en;
  return displayText(c.title);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function blockText(b) {
  if (b.type === 'text') return displayText(b.text);
  if (b.type === 'file') return displayText(b.file.name);
  if (b.type === 'embed') return displayText(b.embed.title);
  return '';
}
function entriesFor(id) {
  return SNAPSHOT.entries.filter((e) => e.channel_id === id).sort((a,b) => a.created_at.localeCompare(b.created_at));
}
function lastPreview(id) {
  const rows = entriesFor(id);
  const last = rows[rows.length - 1];
  return last ? last.body.map(blockText).join(' ') : '';
}
function setLang(next) {
  const u = new URL(location.href);
  u.searchParams.set('lang', next);
  location.href = u.toString();
}
document.getElementById('lang-zh').addEventListener('click', () => setLang('zh'));
document.getElementById('lang-en').addEventListener('click', () => setLang('en'));
document.getElementById('lang-zh').classList.toggle('active', locale === 'zh');
document.getElementById('lang-en').classList.toggle('active', locale === 'en');

function whoBar() {
  const people = SNAPSHOT.accounts;
  return '<div class="who">' + people.map((a) => {
    const on = sessionActor === a.id ? ' on' : '';
    return '<button type="button" class="enter-as' + on + '" data-id="' + escapeHtml(a.id) + '">' +
      escapeHtml(t.enterAs) + ' ' + escapeHtml(displayText(a.display_name)) + '</button>';
  }).join('') + (sessionActor ? '<span>' + escapeHtml(t.signedIn) + '</span>' : '') + '</div>';
}

async function enterAs(id) {
  const res = await fetch('/v1/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/vnd.ocp+json' },
    body: JSON.stringify({ id, password: 'demo-pass' })
  });
  if (!res.ok) return;
  const data = await res.json();
  sessionToken = data.token;
  sessionActor = id;
  render();
}

async function sendText(channelId, type, extra) {
  const text = (document.getElementById('compose-text') || {}).value;
  if (!text || !sessionToken) return;
  const body = { type, body: [{ type: 'text', text, format: 'plain' }], parent_id: null, anchor: null };
  if (extra) Object.assign(body, extra);
  const res = await fetch('/v1/channels/' + encodeURIComponent(channelId) + '/entries', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + sessionToken,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.ocp+json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) return;
  const entry = await res.json();
  SNAPSHOT.entries.push(entry);
  render();
}

function composeBox(placeholder) {
  if (!sessionToken) return '';
  return '<div class="compose-box"><textarea id="compose-text" rows="2" placeholder="' + escapeHtml(placeholder) +
    '"></textarea><button type="button" id="compose-send">' + escapeHtml(t.send) + '</button></div>';
}

function renderChat() {
  const ch = SNAPSHOT.channels.find((c) => c.id === selectedId) || SNAPSHOT.channels[0];
  const items = SNAPSHOT.channels.map((c) => {
    const active = ch && c.id === ch.id ? ' active' : '';
    return '<button type="button" class="im-item' + active + '" data-id="' + escapeHtml(c.id) + '"><div class="name">' +
      escapeHtml(channelTitle(c)) + '</div><div class="preview">' + escapeHtml(lastPreview(c.id)) + '</div></button>';
  }).join('');
  let bubbles = '';
  if (ch) {
    for (const e of entriesFor(ch.id)) {
      const mine = sessionActor && e.author.id === sessionActor;
      const child = e.parent_id ? ' child' : '';
      bubbles += '<div class="im-bubble ' + (mine ? 'me' : 'them') + child + '"><div class="author">' +
        escapeHtml(displayText(e.author.display_name)) + '</div>' + escapeHtml(e.body.map(blockText).join('\\n')) + '</div>';
    }
  }
  document.getElementById('app').innerHTML =
    '<aside class="im-list"><h2 class="sr-only">' + escapeHtml(t.conversations) + '</h2>' + items + '</aside>' +
    '<section class="im-thread"><div class="im-head">' + (ch ? escapeHtml(channelTitle(ch)) : '') + '</div>' +
    '<div class="im-bubbles">' + bubbles + '<div style="clear:both"></div></div>' +
    '<div class="im-compose">' + whoBar() + composeBox(t.composeMessage) + '</div></section>';
}

function childTasks(projectId) {
  const ids = SNAPSHOT.links.filter((l) => l.type === 'parent' && l.target_id === projectId).map((l) => l.source_id);
  return SNAPSHOT.channels.filter((c) => ids.includes(c.id) || (c.type === 'task' && SNAPSHOT.links.some((l) => l.source_id === c.id && l.target_id === projectId)));
}

function renderTasks() {
  const projects = SNAPSHOT.channels.filter((c) => c.type === 'project');
  const tasks = SNAPSHOT.channels.filter((c) => c.type === 'task');
  const ch = SNAPSHOT.channels.find((c) => c.id === selectedId) || projects[0] || tasks[0];
  const nav = '<h2>' + escapeHtml(t.projects) + '</h2>' + projects.map((c) => {
    const active = ch && c.id === ch.id ? ' active' : '';
    return '<button type="button" class="pm-item' + active + '" data-id="' + escapeHtml(c.id) + '">' +
      escapeHtml(channelTitle(c)) + '</button>';
  }).join('') + '<h2>' + escapeHtml(t.tasks) + '</h2>' + tasks.map((c) => {
    const active = ch && c.id === ch.id ? ' active' : '';
    const st = c.ext && c.ext.status ? String(c.ext.status) : '';
    return '<button type="button" class="pm-item' + active + '" data-id="' + escapeHtml(c.id) + '">' +
      escapeHtml(channelTitle(c)) + (st ? '<div class="meta">' + escapeHtml(displayText(st)) + '</div>' : '') + '</button>';
  }).join('');
  let main = '<div class="empty"></div>';
  if (ch) {
    const body = ch.body.map((b) => '<p>' + escapeHtml(blockText(b)) + '</p>').join('');
    let extras = '';
    if (ch.type === 'project') {
      extras = childTasks(ch.id).map((task) => {
        const st = task.ext && task.ext.status ? String(task.ext.status) : '';
        return '<div class="pm-task"><button type="button" class="pm-item" data-id="' + escapeHtml(task.id) + '">' +
          escapeHtml(channelTitle(task)) + '</button>' + (st ? '<span class="chip">' + escapeHtml(displayText(st)) + '</span>' : '') + '</div>';
      }).join('');
    }
    const comments = entriesFor(ch.id).map((e) =>
      '<div class="pm-comment"><div class="author">' + escapeHtml(displayText(e.author.display_name)) + '</div>' +
      escapeHtml(e.body.map(blockText).join('\\n')) + '</div>'
    ).join('');
    main = '<div class="pm-hero"><h1>' + escapeHtml(channelTitle(ch)) + '</h1>' + body + extras + '</div>' +
      '<div class="pm-comments"><h2>' + escapeHtml(t.entries) + '</h2>' + comments +
      '<div class="pm-compose">' + whoBar() + composeBox(t.writeEntry) + '</div></div>';
  }
  document.getElementById('app').innerHTML = '<aside class="pm-nav">' + nav + '</aside><div class="pm-main">' + main + '</div>';
}

function fileText(id) {
  const f = SNAPSHOT.files.find((x) => x.id === id);
  return f && f.text ? f.text : '';
}

function renderNotes() {
  const notes = SNAPSHOT.channels.filter((c) => c.type === 'note');
  const ch = SNAPSHOT.channels.find((c) => c.id === selectedId) || notes[0];
  const nav = '<h2>' + escapeHtml(t.notesNav) + '</h2>' + notes.map((c) => {
    const active = ch && c.id === ch.id ? ' active' : '';
    return '<button type="button" class="doc-item' + active + '" data-id="' + escapeHtml(c.id) + '">' +
      escapeHtml(channelTitle(c)) + '</button>';
  }).join('');
  let paper = '';
  if (ch) {
    const anns = entriesFor(ch.id).filter((e) => e.anchor && e.anchor.block_id);
    const body = ch.body.map((b) => {
      if (b.type === 'file') {
        return '<div class="doc-file">' + escapeHtml(displayText(b.file.name)) + '\\n' +
          escapeHtml(displayText(fileText(b.file.id))) + '</div>';
      }
      let text = escapeHtml(blockText(b));
      for (const a of anns) {
        if (a.anchor.block_id === b.id && a.anchor.quote) {
          const q = escapeHtml(displayText(a.anchor.quote));
          text = text.replace(q, '<mark class="ann-mark">' + q + '</mark>');
        }
      }
      return '<p>' + text + '</p>';
    }).join('');
    const annHtml = anns.map((e) =>
      '<div class="ann"><div class="quote">' + escapeHtml(displayText((e.anchor && e.anchor.quote) || '')) +
      '</div>' + escapeHtml(e.body.map(blockText).join(' ')) + '</div>'
    ).join('');
    const revs = SNAPSHOT.revisions.filter((r) => r.channel_id === ch.id);
    const revHtml = revs.map((r) => '<div>' + escapeHtml(r.created_at) + ' · ' + escapeHtml(channelTitle({ id: ch.id, title: r.title })) + '</div>').join('');
    const links = SNAPSHOT.links.filter((l) => l.source_id === ch.id || l.target_id === ch.id);
    const linkHtml = links.map((l) => {
      const oid = l.source_id === ch.id ? l.target_id : l.source_id;
      const oc = SNAPSHOT.channels.find((c) => c.id === oid);
      const label = oc ? channelTitle(oc) : (l.title || oid || l.target_url || '');
      return oc
        ? '<button type="button" class="doc-link" data-id="' + escapeHtml(oc.id) + '">' + escapeHtml(label) + '</button>'
        : escapeHtml(label);
    }).join('<br>');
    paper = '<h1>' + escapeHtml(channelTitle(ch)) + '</h1><div class="body">' + body + '</div>' +
      '<div class="doc-aside"><h2>' + escapeHtml(t.annotations) + '</h2>' + annHtml +
      '<h2>' + escapeHtml(t.revisions) + '</h2>' + revHtml +
      '<h2>' + escapeHtml(t.links) + '</h2>' + linkHtml +
      '<div class="doc-compose">' + whoBar() + composeBox(t.writeEntry) + '</div></div>';
  }
  document.getElementById('app').innerHTML = '<aside class="doc-nav">' + nav + '</aside><article class="doc-paper">' + paper + '</article>';
}

function render() {
  t = T0;
  if (KIND === 'chat') renderChat();
  else if (KIND === 'tasks') renderTasks();
  else renderNotes();
  document.querySelectorAll('[data-id]').forEach((el) => {
    if (el.classList.contains('enter-as')) return;
    el.addEventListener('click', () => { selectedId = el.getAttribute('data-id'); render(); });
  });
  document.querySelectorAll('.enter-as').forEach((el) => {
    el.addEventListener('click', () => { void enterAs(el.getAttribute('data-id')); });
  });
  const send = document.getElementById('compose-send');
  if (send) {
    const ch = SNAPSHOT.channels.find((c) => c.id === selectedId);
    const type = ch && (ch.type === 'dm' || ch.type === 'group' || ch.type === 'room') ? 'message' : 'comment';
    send.addEventListener('click', () => { void sendText(selectedId, type); });
  }
}
render();
`;
}
