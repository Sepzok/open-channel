export type Capabilities = {
  body: boolean;
  entries: boolean;
  entry_threads: boolean;
  links: boolean;
  shares: boolean;
  revisions: boolean;
};

export type Actor = { id: string; display_name: string };

export type Member = Actor & { role: string };

export type FileMeta = { id: string; name: string; media_type: string; size: number };

export type Block =
  | { id: string; type: 'text'; text: string; format: 'plain' | 'markdown' }
  | { id: string; type: 'file'; file: FileMeta }
  | { id: string; type: 'embed'; embed: { url: string; title: string } };

export type ExtValue = string | number | boolean;

export type Channel = {
  id: string;
  type: string;
  title: string;
  body: Block[];
  capabilities: Capabilities;
  members: Member[];
  ext?: Record<string, ExtValue>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  revision: string | null;
};

export type Entry = {
  id: string;
  channel_id: string;
  type: string;
  body: Block[];
  parent_id: string | null;
  anchor: { block_id: string; quote?: string } | null;
  author: Actor;
  ext?: Record<string, ExtValue>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Link = {
  id: string;
  type: string;
  source_id: string;
  target_id?: string;
  target_url?: string;
  title?: string;
  ext?: Record<string, ExtValue>;
  created_at: string;
  deleted_at: string | null;
};

export type Share = {
  id: string;
  channel_id: string;
  token: string;
  scope: 'view' | 'comment';
  url: string;
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

export type Revision = {
  id: string;
  channel_id: string;
  title: string;
  body: Block[];
  created_at: string;
  author: Actor;
};

export type StoreData = {
  channels: Record<string, Channel>;
  entries: Record<string, Entry>;
  links: Record<string, Link>;
  shares: Record<string, Share>;
  revisions: Record<string, Revision>;
  files: Record<string, FileMeta>;
};

export type SeedFile = {
  id: string;
  name: string;
  media_type: string;
  text?: string;
};

export type Seed = {
  files?: SeedFile[];
  channels?: Partial<Channel> & { id: string; type: string; title: string }[];
  edits?: { channel_id: string; author?: Actor; body: Block[] }[];
  entries?: Partial<Entry> & { id: string; channel_id: string; type: string; body: Block[] }[];
  links?: Partial<Link> & { id: string; type: string; source_id: string }[];
};

export type AppOptions = {
  providerId: string;
  providerName: string;
  capabilities: Capabilities;
  actor: Actor;
  token: string;
  seed?: Seed;
  dataDir: string;
  publicOrigin: string;
  maxFileBytes?: number;
};
