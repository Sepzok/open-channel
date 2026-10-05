/**
 * Pages / static demo: intercept relative v1/* and api/* with an in-browser store.
 * Seed from window.SNAPSHOT (surface/walk) or window.OCP_DEMO_BUNDLES (console).
 * Not a public OCP API — state stays in the visitor's browser.
 */
(function (global) {
  'use strict';

  const DEMO_PASS = 'demo-pass';
  /** @type {Map<string, any>} */
  const stores = new Map();
  const originalFetch = global.fetch.bind(global);

  function nowIso() {
    return new Date().toISOString();
  }

  function genId(prefix) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return (
      prefix +
      '_' +
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    );
  }

  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function storageKey(scope) {
    return 'ocp-pages-demo:' + scope;
  }

  function scopeFromUrl(url) {
    const path = url.pathname.replace(/\/index\.html$/, '');
    const parts = path.split('/').filter(Boolean);
    const v1i = parts.indexOf('v1');
    if (v1i > 0) return parts[v1i - 1];
    const apiI = parts.indexOf('api');
    if (apiI > 0) return parts[apiI - 1];
    return parts[parts.length - 1] || 'root';
  }

  function hydrateFromSnapshot(snapshot, caps) {
    const accounts = {};
    for (const a of snapshot.accounts || []) {
      accounts[a.id] = { id: a.id, display_name: a.display_name, password: DEMO_PASS };
    }
    const channels = {};
    for (const c of snapshot.channels || []) {
      channels[c.id] = clone(c);
    }
    const entries = {};
    for (const e of snapshot.entries || []) {
      entries[e.id] = clone(e);
    }
    const links = {};
    for (const l of snapshot.links || []) {
      links[l.id] = clone(l);
    }
    const revisions = {};
    for (const r of snapshot.revisions || []) {
      revisions[r.id] = clone(r);
    }
    return {
      provider: snapshot.provider || { id: 'demo', name: 'demo' },
      capabilities: caps || {
        body: false,
        entries: true,
        entry_threads: true,
        links: true,
        shares: false,
        revisions: false,
        live: false,
      },
      accounts,
      sessions: {},
      channels,
      entries,
      links,
      revisions,
      seed: clone(snapshot),
    };
  }

  function loadOrCreate(scope, snapshot, caps) {
    if (stores.has(scope)) return stores.get(scope);
    let store = null;
    try {
      const raw = localStorage.getItem(storageKey(scope));
      if (raw) store = JSON.parse(raw);
    } catch (_) {}
    if (!store) {
      if (!snapshot && global.SNAPSHOT) snapshot = global.SNAPSHOT;
      if (!snapshot) {
        store = hydrateFromSnapshot(
          { accounts: [], channels: [], entries: [], links: [], revisions: [], provider: { id: scope, name: scope } },
          caps,
        );
      } else {
        store = hydrateFromSnapshot(snapshot, caps);
      }
    }
    stores.set(scope, store);
    return store;
  }

  function persist(scope, store) {
    try {
      localStorage.setItem(storageKey(scope), JSON.stringify(store));
    } catch (_) {}
  }

  function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/vnd.ocp+json; charset=utf-8' },
    });
  }

  function problem(status, code) {
    return new Response(JSON.stringify({ type: 'about:blank', title: code, status, code }), {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    });
  }

  function bearer(init) {
    const h = (init && init.headers) || {};
    const get = (k) => {
      if (typeof h.get === 'function') return h.get(k);
      return h[k] || h[k.toLowerCase()];
    };
    const auth = get('Authorization') || get('authorization') || '';
    const m = String(auth).match(/^Bearer\s+(.+)$/i);
    return m ? m[1] : null;
  }

  function resolveSession(store, token) {
    if (!token) return null;
    const se = store.sessions[token];
    if (!se) return null;
    const account = store.accounts[se.account_id];
    if (!account) return null;
    return { actor: { id: account.id, display_name: account.display_name } };
  }

  async function readBody(init) {
    if (!init || init.body == null) return '';
    if (typeof init.body === 'string') return init.body;
    if (init.body instanceof Blob) return await init.body.text();
    return String(init.body);
  }

  function syncSnapshotEntries(store) {
    if (!global.SNAPSHOT) return;
    global.SNAPSHOT.entries = Object.values(store.entries);
  }

  async function handleV1(scope, restPath, method, init, store) {
    if (restPath === '/sessions' && method === 'POST') {
      const raw = await readBody(init);
      let o;
      try {
        o = JSON.parse(raw || '{}');
      } catch {
        return problem(400, 'validation_error');
      }
      const account = store.accounts[o.id];
      if (!account || o.password !== DEMO_PASS) return problem(401, 'unauthorized');
      const token = genId('sess');
      store.sessions[token] = { id: token, account_id: account.id, token };
      persist(scope, store);
      return jsonResponse(201, {
        id: token,
        account: { id: account.id, display_name: account.display_name },
        token,
      });
    }

    const identity = resolveSession(store, bearer(init));

    if (restPath === '' || restPath === '/') {
      if (method === 'GET') {
        return jsonResponse(200, {
          protocol: 'ocp',
          version: '1',
          provider: store.provider,
          actor: identity ? identity.actor : { id: 'u_fuse', display_name: '融合台' },
          capabilities: store.capabilities,
        });
      }
    }

    const chList = restPath.match(/^\/channels\/?$/);
    if (chList && method === 'GET') {
      if (!identity) return problem(401, 'unauthorized');
      const data = Object.values(store.channels).map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        updated_at: c.updated_at || c.created_at || nowIso(),
        body: c.body || [],
        members: c.members || [],
        ext: c.ext,
        capabilities: store.capabilities,
      }));
      return jsonResponse(200, { data });
    }

    const chOne = restPath.match(/^\/channels\/([^/]+)$/);
    if (chOne && method === 'GET') {
      if (!identity) return problem(401, 'unauthorized');
      const c = store.channels[chOne[1]];
      if (!c) return problem(404, 'not_found');
      return jsonResponse(200, {
        ...c,
        capabilities: store.capabilities,
        updated_at: c.updated_at || nowIso(),
      });
    }

    const entList = restPath.match(/^\/channels\/([^/]+)\/entries$/);
    if (entList) {
      const chId = entList[1];
      const ch = store.channels[chId];
      if (!ch) return problem(404, 'not_found');
      if (!identity) return problem(401, 'unauthorized');
      if (method === 'GET') {
        const data = Object.values(store.entries)
          .filter((e) => e.channel_id === chId)
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        return jsonResponse(200, { data });
      }
      if (method === 'POST') {
        const raw = await readBody(init);
        let o;
        try {
          o = JSON.parse(raw || '{}');
        } catch {
          return problem(400, 'validation_error');
        }
        const ts = nowIso();
        const entry = {
          id: genId('en'),
          channel_id: chId,
          type: o.type || 'message',
          body: o.body || [],
          parent_id: o.parent_id ?? null,
          anchor: o.anchor ?? null,
          author: identity.actor,
          created_at: ts,
          updated_at: ts,
          deleted_at: null,
        };
        store.entries[entry.id] = entry;
        persist(scope, store);
        syncSnapshotEntries(store);
        return jsonResponse(201, entry);
      }
    }

    const linksList = restPath.match(/^\/channels\/([^/]+)\/links$/);
    if (linksList && method === 'GET') {
      if (!identity) return problem(401, 'unauthorized');
      const chId = linksList[1];
      const data = Object.values(store.links).filter((l) => l.source_id === chId || l.target_id === chId);
      return jsonResponse(200, { data });
    }

    const revList = restPath.match(/^\/channels\/([^/]+)\/revisions$/);
    if (revList && method === 'GET') {
      if (!identity) return problem(401, 'unauthorized');
      const chId = revList[1];
      const data = Object.values(store.revisions).filter((r) => r.channel_id === chId);
      return jsonResponse(200, { data });
    }

    const admit = restPath.match(/^\/channels\/([^/]+)\/admissions$/);
    if (admit && method === 'POST') {
      if (!identity) return problem(401, 'unauthorized');
      const token = genId('adm');
      return jsonResponse(201, {
        token,
        url: 'inproc:walk',
        channel_id: admit[1],
        actor: identity.actor,
        expires_at: new Date(Date.now() + 60000).toISOString(),
      });
    }

    return problem(404, 'not_found');
  }

  function ensureBundles() {
    const bundles = global.OCP_DEMO_BUNDLES;
    if (!bundles) return null;
    for (const [id, pack] of Object.entries(bundles)) {
      if (!stores.has(id)) {
        loadOrCreate(id, pack.snapshot, pack.capabilities);
      }
    }
    return bundles;
  }

  async function handleApi(restPath, method, init) {
    const bundles = ensureBundles();
    if (!bundles) return problem(404, 'not_found');

    if (restPath === '/channels' && method === 'GET') {
      const channels = [];
      for (const [id, pack] of Object.entries(bundles)) {
        const store = loadOrCreate(id, pack.snapshot, pack.capabilities);
        for (const c of Object.values(store.channels)) {
          channels.push({
            providerId: id,
            providerName: pack.snapshot.provider?.name || id,
            providerAvailable: true,
            channel: {
              id: c.id,
              type: c.type,
              title: c.title,
              updated_at: c.updated_at || nowIso(),
            },
          });
        }
      }
      return new Response(JSON.stringify({ channels }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const detail = restPath.match(/^\/channels\/([^/]+)\/([^/]+)$/);
    if (detail && method === 'GET') {
      const pid = detail[1];
      const chId = detail[2];
      const pack = bundles[pid];
      if (!pack) {
        return new Response('{}', { status: 404 });
      }
      const store = loadOrCreate(pid, pack.snapshot, pack.capabilities);
      const channel = store.channels[chId];
      if (!channel) return new Response('{}', { status: 404 });
      const entries = Object.values(store.entries).filter((e) => e.channel_id === chId);
      const links = Object.values(store.links).filter((l) => l.source_id === chId);
      const revisions = Object.values(store.revisions).filter((r) => r.channel_id === chId);
      return new Response(
        JSON.stringify({
          capabilities: store.capabilities,
          channel: { ...channel, capabilities: store.capabilities },
          entries: { data: entries },
          links: { data: links },
          linksInParent: { data: [] },
          revisions: { data: revisions },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const entryPost = restPath.match(/^\/channels\/([^/]+)\/([^/]+)\/entries$/);
    if (entryPost && method === 'POST') {
      const pid = entryPost[1];
      const chId = entryPost[2];
      const pack = bundles[pid];
      const store = loadOrCreate(pid, pack.snapshot, pack.capabilities);
      const raw = await readBody(init);
      const { text } = JSON.parse(raw || '{}');
      const ch = store.channels[chId];
      const type =
        ch && (ch.type === 'dm' || ch.type === 'group' || ch.type === 'room') ? 'message' : 'comment';
      const fuse = store.accounts.u_fuse || Object.values(store.accounts)[0];
      const ts = nowIso();
      const entry = {
        id: genId('en'),
        channel_id: chId,
        type,
        body: [{ type: 'text', text, format: 'plain' }],
        parent_id: null,
        anchor: null,
        author: { id: fuse.id, display_name: fuse.display_name },
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };
      store.entries[entry.id] = entry;
      persist(pid, store);
      return new Response(JSON.stringify(entry), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ code: 'not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function matchDemoUrl(url) {
    const path = url.pathname;
    const v1 = path.match(/\/v1(\/.*)?$/);
    if (v1) {
      return { kind: 'v1', scope: scopeFromUrl(url), rest: v1[1] || '/' };
    }
    const api = path.match(/\/api(\/.*)?$/);
    if (api) {
      return { kind: 'api', rest: api[1] || '/' };
    }
    return null;
  }

  global.fetch = async function demoFetch(input, init) {
    const url = new URL(typeof input === 'string' ? input : input.url, global.location.href);
    if (url.origin !== global.location.origin) {
      return originalFetch(input, init);
    }
    const matched = matchDemoUrl(url);
    if (!matched) return originalFetch(input, init);
    const method = ((init && init.method) || 'GET').toUpperCase();
    if (matched.kind === 'v1') {
      const snap = global.SNAPSHOT;
      const caps = global.OCP_DEMO_CAPS;
      const store = loadOrCreate(matched.scope, snap, caps);
      return handleV1(matched.scope, matched.rest, method, init || {}, store);
    }
    return handleApi(matched.rest, method, init || {});
  };

  global.OCP_DEMO = {
    reset(scope) {
      const key = scope || scopeFromUrl(new URL('.', global.location.href));
      localStorage.removeItem(storageKey(key));
      stores.delete(key);
    },
    /** @internal test helper */
    _stores: stores,
    _handleV1: handleV1,
    _loadOrCreate: loadOrCreate,
    _hydrateFromSnapshot: hydrateFromSnapshot,
  };

  // Register SW for same-origin caching when available (optional).
  if ('serviceWorker' in navigator) {
    const swUrl = new URL('../runtime/sw.js', global.location.href);
    // Only register when runtime path exists under site/
    if (/\bruntimes?\b|\/chat\/|\/tasks\/|\/notes\/|\/walk\/|\/console\/|\/ticket\//.test(global.location.pathname)) {
      navigator.serviceWorker.register(new URL('../runtime/sw.js', global.location.href).href).catch(function () {});
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
