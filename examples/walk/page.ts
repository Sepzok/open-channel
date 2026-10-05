import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { displayChannelTitle, displaySeedText, messagesFor, type Locale } from '@open-channel/server';

const ocm1Src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'ocm1.js'), 'utf8');

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

type Snap = {
  provider: { name: string };
  channels: { id: string; title: string }[];
  accounts: { id: string; display_name: string }[];
};

export function renderWalkPage(ctx: {
  locale: Locale;
  snapshot: unknown;
  demoRuntimeSrc?: string;
  walkDemoSrc?: string;
}): string {
  const snapshot = ctx.snapshot as Snap;
  const locale = ctx.locale;
  const t = messagesFor(locale);
  const title = displaySeedText(snapshot.provider.name, locale);
  const room = snapshot.channels.find((c) => c.id === 'ch_walk') ?? snapshot.channels[0];
  const roomTitle = room ? displayChannelTitle(room.id, room.title, locale) : title;
  const snapJson = JSON.stringify(snapshot).replace(/</g, '\\u003c');
  const runtimeTags =
    (ctx.demoRuntimeSrc ? `<script src="${escapeHtml(ctx.demoRuntimeSrc)}"></script>\n` : '') +
    (ctx.walkDemoSrc ? `<script src="${escapeHtml(ctx.walkDemoSrc)}"></script>\n` : '');
  return `<!DOCTYPE html>
<html lang="${escapeHtml(t.htmlLang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #e8eef4; color: #1a1a1a; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; background: #fff; }
  .brand { font-weight: 700; }
  .lang-switch button, button { appearance: none; font: inherit; border-radius: 8px; cursor: pointer; }
  .lang-switch button { padding: 6px 10px; border: 1px solid #c5cad3; background: #fff; }
  .lang-switch button.active { background: #1d4e89; color: #fff; border-color: #1d4e89; }
  .stage-wrap { max-width: 720px; margin: 24px auto; padding: 0 16px 48px; }
  h1 { margin: 0 0 8px; }
  .hint { color: #5c6370; margin: 0 0 16px; }
  .playfield { position: relative; width: 100%; aspect-ratio: 1; background: #f7fafc; border: 1px solid #d5deea; border-radius: 12px; overflow: hidden; }
  .cell-grid { position: absolute; inset: 0; background-image: linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px); background-size: 5% 5%; }
  .actor { position: absolute; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; color: #fff; }
  .actor.lin { background: #1d4e89; }
  .actor.zhou { background: #c2410c; }
  #walk-start { margin-top: 16px; padding: 10px 18px; border: 1px solid #1d4e89; background: #1d4e89; color: #fff; }
  .log { margin-top: 16px; font-size: 0.9rem; color: #3f4a57; }
</style>
</head>
<body>
<header>
  <div class="brand">${escapeHtml(title)}</div>
  <div class="lang-switch">
    <button type="button" id="lang-zh" data-lang="zh">${escapeHtml(t.langZh)}</button>
    <button type="button" id="lang-en" data-lang="en">${escapeHtml(t.langEn)}</button>
  </div>
</header>
<div class="stage-wrap">
  <h1>${escapeHtml(roomTitle)}</h1>
  <p class="hint">${escapeHtml(t.walkHint)}</p>
  <div class="playfield" id="playfield">
    <div class="cell-grid"></div>
    <div class="actor lin" id="actor-lin" hidden title="林可">林可</div>
    <div class="actor zhou" id="actor-zhou" hidden title="周宁">周宁</div>
  </div>
  <button type="button" id="walk-start">${escapeHtml(t.walkStart)}</button>
  <div class="log" id="walk-log"></div>
</div>
${runtimeTags}<script type="module">
${ocm1Src}
const locale = ${JSON.stringify(locale)};
const SNAPSHOT = ${snapJson};
window.SNAPSHOT = SNAPSHOT;
document.getElementById('lang-zh').classList.toggle('active', locale === 'zh');
document.getElementById('lang-en').classList.toggle('active', locale === 'en');
document.getElementById('lang-zh').onclick = () => { const u = new URL(location.href); u.searchParams.set('lang','zh'); location.href = u; };
document.getElementById('lang-en').onclick = () => { const u = new URL(location.href); u.searchParams.set('lang','en'); location.href = u; };

const CHANNEL = 'ch_walk';
let sockets = [];

function place(el, x, y) {
  el.hidden = false;
  el.style.left = (50 + x * 5) + '%';
  el.style.top = (50 + y * 5) + '%';
}

function applyState(state) {
  if (!state || !state.pos) return;
  if (state.pos.u_lin) place(document.getElementById('actor-lin'), state.pos.u_lin.x, state.pos.u_lin.y);
  if (state.pos.u_zhou) place(document.getElementById('actor-zhou'), state.pos.u_zhou.x, state.pos.u_zhou.y);
}

async function session(id) {
  const res = await fetch('v1/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/vnd.ocp+json' },
    body: JSON.stringify({ id, password: 'demo-pass' })
  });
  const data = await res.json();
  return data.token;
}

async function admit(token) {
  const res = await fetch('v1/channels/' + CHANNEL + '/admissions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.ocp+json', 'Content-Type': 'application/json' },
    body: '{}'
  });
  return res.json();
}

function openPlayer(actorId, admission) {
  if (admission.url && String(admission.url).startsWith('inproc:') && window.OCP_WALK_DEMO) {
    return window.OCP_WALK_DEMO.openPlayer(actorId, admission, applyState);
  }
  const ws = new WebSocket(admission.url);
  ws.binaryType = 'arraybuffer';
  let inputSeq = 1;
  const join = encodeOcm1({
    kind: 'join', seq: 0, channelId: CHANNEL, actorId,
    payload: new TextEncoder().encode(admission.token)
  });
  ws.onopen = () => ws.send(join);
  ws.onmessage = (ev) => {
    const frame = decodeOcm1(new Uint8Array(ev.data));
    if (!frame || frame.kind !== 'snapshot') return;
    try { applyState(JSON.parse(new TextDecoder().decode(frame.payload))); } catch (_) {}
  };
  return {
    sendDir(dir) {
      const pkt = encodeOcm1({
        kind: 'input', seq: inputSeq++, channelId: CHANNEL, actorId,
        payload: new Uint8Array([dir])
      });
      ws.send(pkt);
    }
  };
}

document.getElementById('walk-start').onclick = async () => {
  const log = document.getElementById('walk-log');
  log.textContent = '';
  const linTok = await session('u_lin');
  const zhouTok = await session('u_zhou');
  const a1 = await admit(linTok);
  const a2 = await admit(zhouTok);
  if (!a1.url || !a2.url) { log.textContent = 'admission failed'; return; }
  const pLin = openPlayer('u_lin', a1);
  const pZhou = openPlayer('u_zhou', a2);
  sockets = [pLin, pZhou];
  window.onkeydown = (ev) => {
    if (!sockets.length) return;
    if (ev.key === 'ArrowLeft') pLin.sendDir(0);
    if (ev.key === 'ArrowRight') pLin.sendDir(1);
    if (ev.key === 'ArrowUp') pLin.sendDir(2);
    if (ev.key === 'ArrowDown') pLin.sendDir(3);
    if (ev.key === 'a' || ev.key === 'A') pZhou.sendDir(0);
    if (ev.key === 'd' || ev.key === 'D') pZhou.sendDir(1);
    if (ev.key === 'w' || ev.key === 'W') pZhou.sendDir(2);
    if (ev.key === 's' || ev.key === 'S') pZhou.sendDir(3);
  };
};

void SNAPSHOT;
</script>
</body>
</html>`;
}
