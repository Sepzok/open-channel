import crypto from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';
import type { Account, Channel, Grant, Identity, ProviderRole, StoreData, AppOptions } from './types.js';
import { genId, genShareToken, nowIso, sha256 } from './util.js';

type AuthStore = {
  options: AppOptions;
  data: StoreData;
  getChannel(id: string): Channel | undefined;
};

export function publicAccount(a: Account): Omit<Account, 'password_hash'> {
  return {
    id: a.id,
    display_name: a.display_name,
    provider_role: a.provider_role,
    created_at: a.created_at,
  };
}

export function publicGrant(g: Grant): Omit<Grant, 'token_hash' | 'created_by'> & { created_by?: string } {
  return {
    id: g.id,
    channel_id: g.channel_id,
    scope: g.scope,
    expires_at: g.expires_at,
    created_at: g.created_at,
    revoked_at: g.revoked_at,
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export const DUMMY_PASSWORD_HASH = hashPassword('reserved-dummy-password');

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length, { N: 16384, r: 8, p: 1 });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function grantActive(g: Grant): boolean {
  if (g.revoked_at) return false;
  if (g.expires_at <= nowIso()) return false;
  return true;
}

export function ensureBootstrapAccount(store: AuthStore): void {
  const actor = store.options.actor;
  if (store.data.accounts[actor.id]) return;
  store.data.accounts[actor.id] = {
    id: actor.id,
    display_name: actor.display_name,
    provider_role: 'owner',
    password_hash: hashPassword(crypto.randomBytes(16).toString('hex')),
    created_at: nowIso(),
  };
}

export function resolveBearer(store: AuthStore, token: string): Identity | null {
  if (token.length === 0) return null;
  const bootstrap = store.options.token;
  const ba = Buffer.from(token);
  const bb = Buffer.from(bootstrap);
  if (ba.length === bb.length && timingSafeEqual(ba, bb)) {
    ensureBootstrapAccount(store);
    const account = store.data.accounts[store.options.actor.id]!;
    return { kind: 'account', account, actor: { id: account.id, display_name: account.display_name } };
  }
  const hash = sha256(token);
  for (const se of Object.values(store.data.sessions)) {
    if (se.revoked_at) continue;
    if (se.token_hash !== hash) continue;
    const account = store.data.accounts[se.account_id];
    if (!account) return null;
    return { kind: 'account', account, actor: { id: account.id, display_name: account.display_name }, session: se };
  }
  for (const g of Object.values(store.data.grants)) {
    if (g.token_hash !== hash) continue;
    if (!grantActive(g)) return null;
    return {
      kind: 'grant',
      grant: g,
      actor: { id: 'grant', display_name: '临时访问' },
    };
  }
  return null;
}

export function channelMembership(ch: Channel, accountId: string): string | null {
  const m = ch.members.find((x) => x.id === accountId);
  return m ? m.role : null;
}

export function canSeeChannel(id: Identity, ch: Channel): boolean {
  if (id.kind === 'grant') return id.grant.channel_id === ch.id;
  if (id.account.provider_role === 'owner') return true;
  return channelMembership(ch, id.account.id) !== null;
}

export function canCreateChannel(id: Identity): boolean {
  if (id.kind === 'grant') return false;
  return id.account.provider_role === 'owner' || id.account.provider_role === 'member';
}

export function canCreateAccount(id: Identity): boolean {
  return id.kind === 'account' && id.account.provider_role === 'owner';
}

export function canCreateGrant(id: Identity, ch: Channel): boolean {
  if (id.kind === 'grant') return false;
  if (id.account.provider_role === 'owner') return true;
  return channelMembership(ch, id.account.id) === 'owner';
}

export function canCreateShare(id: Identity, ch: Channel): boolean {
  return canCreateGrant(id, ch);
}

export function canDeleteChannel(id: Identity, ch: Channel): boolean {
  return canCreateGrant(id, ch);
}

export function canPatchMembers(id: Identity, ch: Channel): boolean {
  return canCreateGrant(id, ch);
}

export function canWriteBody(id: Identity, ch: Channel): boolean {
  if (id.kind === 'grant') return id.grant.scope === 'edit' && id.grant.channel_id === ch.id;
  if (id.account.provider_role === 'owner') return true;
  const role = channelMembership(ch, id.account.id);
  return role === 'owner' || role === 'member';
}

export function canCreateEntry(id: Identity, ch: Channel): boolean {
  if (id.kind === 'grant') {
    return (id.grant.scope === 'comment' || id.grant.scope === 'edit') && id.grant.channel_id === ch.id;
  }
  if (id.account.provider_role === 'owner') return true;
  return channelMembership(ch, id.account.id) !== null;
}

export function canWriteLinks(id: Identity, ch: Channel): boolean {
  return canWriteBody(id, ch);
}

export function canUploadFile(id: Identity, ch?: Channel): boolean {
  if (id.kind === 'grant') return id.grant.scope === 'edit' || id.grant.scope === 'comment';
  if (!ch) {
    if (id.account.provider_role === 'guest') return false;
    return true;
  }
  return canCreateEntry(id, ch);
}

export function canReadFile(store: AuthStore, id: Identity, fileId: string): boolean {
  const referencedBy = (channelId: string) => {
    const ch = store.getChannel(channelId);
    if (!ch) return false;
    if (ch.body.some((b) => b.type === 'file' && b.file.id === fileId)) return true;
    return Object.values(store.data.entries).some(
      (e) => e.channel_id === channelId && !e.deleted_at && e.body.some((b) => b.type === 'file' && b.file.id === fileId),
    );
  };
  if (id.kind === 'grant') return referencedBy(id.grant.channel_id);
  if (id.account.provider_role === 'owner') return true;
  return Object.values(store.data.channels).some((ch) => canSeeChannel(id, ch) && referencedBy(ch.id));
}

export function createSession(store: AuthStore, account: Account): { id: string; token: string } {
  const token = genShareToken();
  const se = {
    id: genId('se'),
    account_id: account.id,
    token_hash: sha256(token),
    created_at: nowIso(),
    revoked_at: null as string | null,
  };
  store.data.sessions[se.id] = se;
  return { id: se.id, token };
}

export function createGrantRecord(
  store: AuthStore,
  input: { channel_id: string; scope: Grant['scope']; expires_at: string; created_by: string },
): { grant: Grant; token: string } {
  const token = genShareToken();
  const grant: Grant = {
    id: genId('gr'),
    channel_id: input.channel_id,
    scope: input.scope,
    token_hash: sha256(token),
    expires_at: input.expires_at,
    created_at: nowIso(),
    revoked_at: null,
    created_by: input.created_by,
  };
  store.data.grants[grant.id] = grant;
  return { grant, token };
}

export function isProviderRole(s: string): s is ProviderRole {
  return s === 'owner' || s === 'member' || s === 'guest';
}

export function isChannelRole(s: string): boolean {
  return s === 'owner' || s === 'member' || s === 'guest';
}

export function validateMembers(store: AuthStore, members: { id: string; display_name: string; role: string }[]): string | null {
  for (const m of members) {
    if (!isChannelRole(m.role)) return 'role';
    const acc = store.data.accounts[m.id];
    if (!acc) return 'account';
    if (acc.provider_role === 'guest' && m.role === 'owner') return 'guest_owner';
  }
  return null;
}

export type { Identity };
