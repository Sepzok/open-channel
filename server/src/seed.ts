import fs from 'node:fs';
import path from 'node:path';
import type { Block, Entry, Link, Seed, Store } from './types.js';
import { createChannelRecord, updateChannelBody } from './store.js';
import { nowIso, parseExt } from './util.js';
import { ensureBootstrapAccount, hashPassword, isProviderRole } from './auth.js';

export function importSeed(store: Store, seed: Seed): void {
  const actor = store.options.actor;

  for (const acc of seed.accounts ?? []) {
    if (!isProviderRole(acc.provider_role)) throw new Error(`Invalid provider_role ${acc.id}`);
    store.data.accounts[acc.id] = {
      id: acc.id,
      display_name: acc.display_name,
      provider_role: acc.provider_role,
      password_hash: hashPassword(acc.password),
      created_at: nowIso(),
    };
  }
  ensureBootstrapAccount(store);

  const requireExt = (raw: unknown, where: string) => {
    if (raw === undefined) return undefined;
    const er = parseExt(raw);
    if (!er.ok) throw new Error(`Invalid seed ext at ${where}`);
    return er.ext;
  };
  for (const ch of seed.channels ?? []) requireExt(ch.ext, `channels.${ch.id}`);
  for (const en of seed.entries ?? []) requireExt(en.ext, `entries.${en.id}`);
  for (const ln of seed.links ?? []) requireExt(ln.ext, `links.${ln.id}`);

  for (const f of seed.files ?? []) {
    const bytes = Buffer.from(f.text ?? '', 'utf8');
    const meta = {
      id: f.id,
      name: f.name,
      media_type: f.media_type,
      size: bytes.length,
    };
    store.data.files[f.id] = meta;
    fs.writeFileSync(path.join(store.filesDir, f.id), bytes);
  }

  for (const ch of seed.channels ?? []) {
    const body = (ch.body ?? []) as Block[];
    createChannelRecord(
      store,
      {
        id: ch.id,
        type: ch.type,
        title: ch.title,
        members: ch.members,
        body,
        ext: requireExt(ch.ext, `channels.${ch.id}`),
      },
      actor,
      true,
    );
  }

  for (const edit of seed.edits ?? []) {
    const ch = store.data.channels[edit.channel_id];
    if (!ch) continue;
    const author = edit.author ?? actor;
    const body = store.syncFileBlocks(store.assignBlockIds(edit.body as Block[], true));
    updateChannelBody(store, ch, undefined, body, author);
  }

  for (const en of seed.entries ?? []) {
    const ch = store.data.channels[en.channel_id];
    if (!ch) continue;
    const ts = nowIso();
    const body = store.syncFileBlocks(store.assignBlockIds(en.body as Block[], true));
    const entry: Entry = {
      id: en.id,
      channel_id: en.channel_id,
      type: en.type,
      body,
      parent_id: en.parent_id ?? null,
      anchor: en.anchor ?? null,
      author: en.author ?? actor,
      ext: requireExt(en.ext, `entries.${en.id}`),
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
    };
    store.data.entries[entry.id] = entry;
    ch.updated_at = ts;
  }

  for (const ln of seed.links ?? []) {
    const ts = nowIso();
    const link: Link = {
      id: ln.id,
      type: ln.type,
      source_id: ln.source_id,
      target_id: ln.target_id,
      target_url: ln.target_url,
      title: ln.title,
      ext: requireExt(ln.ext, `links.${ln.id}`),
      created_at: ts,
      deleted_at: null,
    };
    store.data.links[link.id] = link;
  }
}
