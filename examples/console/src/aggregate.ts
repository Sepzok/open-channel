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

async function fetchJson(url: string, token: string): Promise<{ ok: true; data: unknown } | { ok: false }> {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/v1/channels`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.ocp+json' },
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

export async function aggregateChannels(providers: ProviderConfig[]): Promise<AggregatedChannels> {
  const channels: ChannelRow[] = [];
  for (const p of providers) {
    const result = await fetchJson(p.baseUrl, p.token);
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
