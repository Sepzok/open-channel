import fs from 'node:fs';
import path from 'node:path';
import type { AppOptions, Block, Channel, Entry, ExtValue, FileMeta, Link, Revision, Share, StoreData } from './types.js';
import { genId, nowIso, trimTitle } from './util.js';
import { importSeed } from './seed.js';
import { ensureBootstrapAccount } from './auth.js';

export class Store {
  data: StoreData = {
    channels: {},
    entries: {},
    links: {},
    shares: {},
    revisions: {},
    files: {},
    accounts: {},
    sessions: {},
    grants: {},
  };

  readonly options: AppOptions;
  readonly storePath: string;
  readonly filesDir: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options: AppOptions) {
    this.options = options;
    this.storePath = path.join(options.dataDir, 'store.json');
    this.filesDir = path.join(options.dataDir, 'files');
  }

  async init(): Promise<void> {
    fs.mkdirSync(this.options.dataDir, { recursive: true });
    fs.mkdirSync(this.filesDir, { recursive: true });
    if (fs.existsSync(this.storePath)) {
      const raw = fs.readFileSync(this.storePath, 'utf8');
      this.data = JSON.parse(raw) as StoreData;
      this.data.accounts ??= {};
      this.data.sessions ??= {};
      this.data.grants ??= {};
      const hadBootstrap = Boolean(this.data.accounts[this.options.actor.id]);
      ensureBootstrapAccount(this);
      if (!hadBootstrap) this.persistSync();
    } else if (this.options.seed) {
      await this.runExclusive(async () => {
        importSeed(this, this.options.seed!);
        this.persistSync();
      });
    } else {
      this.persistSync();
    }
  }

  runExclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = this.writeChain.then(() => fn());
    this.writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  persistSync(): void {
    const tmp = `${this.storePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.storePath);
  }

  async persist(): Promise<void> {
    await this.runExclusive(async () => {
      this.persistSync();
    });
  }

  caps(): AppOptions['capabilities'] {
    return this.options.capabilities;
  }

  channelCapabilities(): AppOptions['capabilities'] {
    return this.options.capabilities;
  }

  assignBlockIds(blocks: Block[], allowIds = false): Block[] {
    const seen = new Set<string>();
    return blocks.map((b) => {
      let id = allowIds && b.id ? b.id : genId('blk');
      if (seen.has(id)) id = genId('blk');
      seen.add(id);
      if (b.type === 'text') {
        return { id, type: 'text', text: b.text, format: b.format ?? 'plain' };
      }
      if (b.type === 'file') {
        return { id, type: 'file', file: b.file };
      }
      return { id, type: 'embed', embed: b.embed };
    });
  }

  validateBodyBlocks(blocks: Block[], requireIds = false): string | null {
    if (blocks.length > 200) return 'Too many blocks';
    const ids = new Set<string>();
    for (const b of blocks) {
      if (requireIds && !b.id) return 'Block id required';
      if (b.id && ids.has(b.id)) return 'Duplicate block id';
      if (b.id) ids.add(b.id);
      if (b.type === 'text') {
        if (!b.text || b.text.length < 1 || b.text.length > 100000) return 'Invalid text block';
        if (b.format !== 'plain' && b.format !== 'markdown') return 'Invalid format';
      } else if (b.type === 'file') {
        const f = this.data.files[b.file.id];
        if (!f) return 'file_not_found';
      } else if (b.type === 'embed') {
        if (!/^https?:\/\/\S+$/.test(b.embed.url)) return 'Invalid embed url';
      }
    }
    return null;
  }

  syncFileBlocks(blocks: Block[]): Block[] {
    return blocks.map((b) => {
      if (b.type !== 'file') return b;
      const f = this.data.files[b.file.id];
      if (!f) return b;
      return {
        id: b.id,
        type: 'file',
        file: { id: f.id, name: f.name, media_type: f.media_type, size: f.size },
      };
    });
  }

  addRevision(channel: Channel, author: { id: string; display_name: string }): Revision | null {
    if (!this.caps().revisions) return null;
    const rev: Revision = {
      id: genId('rev'),
      channel_id: channel.id,
      title: channel.title,
      body: JSON.parse(JSON.stringify(channel.body)) as Block[],
      created_at: nowIso(),
      author,
    };
    this.data.revisions[rev.id] = rev;
    channel.revision = rev.id;
    return rev;
  }

  getChannel(id: string): Channel | undefined {
    return this.data.channels[id];
  }

  listChannels(opts: {
    type?: string;
    updated_since?: string;
    include_deleted?: boolean;
    order?: 'updated' | 'created';
    limit: number;
    cursor?: string;
    match?: (ch: Channel) => boolean;
  }): { data: Channel[]; next_cursor: string | null } {
    let items = Object.values(this.data.channels);
    if (!opts.include_deleted) {
      items = items.filter((c) => c.deleted_at === null);
    }
    if (opts.type) items = items.filter((c) => c.type === opts.type);
    if (opts.updated_since) {
      const since = opts.updated_since;
      items = items.filter((c) => c.updated_at > since);
    }
    if (opts.match) items = items.filter(opts.match);
    if (opts.order === 'created') {
      items.sort((a, b) => (a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at.localeCompare(b.created_at)));
    } else {
      items.sort((a, b) => {
        if (a.updated_at !== b.updated_at) return b.updated_at.localeCompare(a.updated_at);
        return a.id.localeCompare(b.id);
      });
    }
    let start = 0;
    if (opts.cursor) {
      try {
        const c = JSON.parse(Buffer.from(opts.cursor, 'base64url').toString()) as { id: string };
        const idx = items.findIndex((x) => x.id === c.id);
        if (idx >= 0) start = idx + 1;
      } catch {
        /* ignore bad cursor */
      }
    }
    const slice = items.slice(start, start + opts.limit);
    const next =
      start + opts.limit < items.length && slice.length > 0
        ? Buffer.from(JSON.stringify({ id: slice[slice.length - 1]!.id }), 'utf8').toString('base64url')
        : null;
    return { data: slice, next_cursor: next };
  }

  publicChannel(ch: Channel): Channel {
    return { ...ch, capabilities: this.channelCapabilities() };
  }
}

export function createChannelRecord(
  store: Store,
  input: {
    id?: string;
    type: string;
    title: string;
    body?: Block[];
    members?: { id: string; display_name: string; role: string }[];
    ext?: Record<string, ExtValue>;
  },
  author: { id: string; display_name: string },
  allowSeedIds = false,
): Channel {
  const ts = nowIso();
  const body = store.syncFileBlocks(store.assignBlockIds(input.body ?? [], allowSeedIds));
  const ch: Channel = {
    id: input.id ?? genId('ch'),
    type: input.type,
    title: trimTitle(input.title),
    body,
    capabilities: store.channelCapabilities(),
    members:
      input.members ??
      [{ id: author.id, display_name: author.display_name, role: 'owner' }],
    ext: input.ext,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    revision: null,
  };
  if (store.caps().revisions) {
    store.addRevision(ch, author);
  }
  store.data.channels[ch.id] = ch;
  return ch;
}

export function updateChannelBody(
  store: Store,
  ch: Channel,
  title?: string,
  body?: Block[],
  author: { id: string; display_name: string } = store.options.actor,
): void {
  if (title !== undefined) ch.title = trimTitle(title);
  if (body !== undefined) {
    ch.body = store.syncFileBlocks(body);
  }
  ch.updated_at = nowIso();
  if (store.caps().revisions && (title !== undefined || body !== undefined)) {
    store.addRevision(ch, author);
  }
}
