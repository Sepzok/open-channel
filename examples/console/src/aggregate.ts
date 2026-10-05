import { scimContains } from '../../../server/src/scimFilter.js';
import { channelResourceUrl, matchProvider } from '@open-channel/sdk';

export type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  token: string;
};

export type ChannelRow = {
  providerId: string;
  providerName: string;
  providerAvailable: boolean;
  channel: {
    id: string;
    type: string;
    title: string;
    updated_at: string;
  };
};

export type AggregatedChannels = {
  channels: ChannelRow[];
};

async function fetchJson(
  url: string,
  token: string,
  filter?: string,
): Promise<{ ok: true; data: unknown } | { ok: false }> {
  try {
    const u = new URL(`${url.replace(/\/$/, '')}/v1/channels`);
    if (filter) u.searchParams.set('filter', filter);
    const res = await fetch(u, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.ocp+json' },
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

export async function aggregateChannels(
  providers: ProviderConfig[],
  opts?: { q?: string },
): Promise<AggregatedChannels> {
  const q = opts?.q?.trim() ?? '';
  const filter = q ? scimContains('title', q) : undefined;
  const channels: ChannelRow[] = [];
  for (const p of providers) {
    const result = await fetchJson(p.baseUrl, p.token, filter);
    if (!result.ok) {
      channels.push({
        providerId: p.id,
        providerName: p.name,
        providerAvailable: false,
        channel: { id: '_unavailable', type: 'unavailable', title: '来源不可用', updated_at: '' },
      });
      continue;
    }
    const list = result.data as { data?: { id: string; type: string; title: string; updated_at: string }[] };
    for (const ch of list.data ?? []) {
      channels.push({
        providerId: p.id,
        providerName: p.name,
        providerAvailable: true,
        channel: { id: ch.id, type: ch.type, title: ch.title, updated_at: ch.updated_at },
      });
    }
  }
  return { channels };
}

export type LinkRow = {
  id: string;
  type: string;
  source_id: string;
  target_id?: string;
  target_url?: string;
  title?: string;
  label?: string;
  resolved: { providerId: string; channelId: string } | null;
};

export function annotateLink(
  providers: ProviderConfig[],
  link: {
    id: string;
    type: string;
    source_id: string;
    target_id?: string;
    target_url?: string;
    title?: string;
    label?: string;
  },
  sourceProviderId: string,
): LinkRow {
  if (link.target_id) {
    return {
      ...link,
      resolved: { providerId: sourceProviderId, channelId: link.target_id },
    };
  }
  if (link.target_url) {
    return { ...link, resolved: matchProvider(providers, link.target_url) };
  }
  return { ...link, resolved: null };
}

export function associateLinkBody(
  source: ProviderConfig,
  target: ProviderConfig,
  channelId: string,
  title: string,
): { type: string; title: string; target_id?: string; target_url?: string } {
  if (source.id === target.id) {
    return { type: 'references', title, target_id: channelId };
  }
  return {
    type: 'references',
    title,
    target_url: channelResourceUrl(target.baseUrl, channelId),
  };
}

export function entryTypeForChannel(channelType: string): string {
  return ['dm', 'group', 'room'].includes(channelType) ? 'message' : 'comment';
}

export const TYPE_LABELS: Record<string, string> = {
  dm: '私聊',
  group: '群组',
  room: '聊天室',
  project: '项目',
  task: '任务',
  note: '笔记',
};
