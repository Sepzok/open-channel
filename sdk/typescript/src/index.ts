export class OcpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super(String(body.title ?? body.code ?? 'OCP error'));
    this.name = 'OcpError';
    this.status = status;
    this.code = String(body.code ?? 'unknown');
    this.body = body;
  }
}

export type ClientOptions = { baseUrl: string; token: string };

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(baseUrl: string, path: string, query?: Query): string {
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function parseResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class Client {
  readonly baseUrl: string;
  readonly token: string;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.token = options.token;
  }

  private async request(
    method: string,
    path: string,
    opts?: { query?: Query; body?: unknown; headers?: Record<string, string>; idempotencyKey?: string; anonymous?: boolean },
  ): Promise<{ status: number; data: unknown; headers: Headers }> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.ocp+json',
      ...opts?.headers,
    };
    if (opts?.anonymous !== true) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    let body: string | Buffer | undefined;
    if (opts?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    if (opts?.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey;
    }
    const res = await fetch(buildUrl(this.baseUrl, path, opts?.query), {
      method,
      headers,
      body: body as BodyInit,
    });
    const data = await parseResponse(res);
    const ct = res.headers.get('content-type') ?? '';
    if (!res.ok) {
      if (ct.includes('problem+json') || (data && typeof data === 'object' && 'code' in (data as object))) {
        throw new OcpError(res.status, data as Record<string, unknown>);
      }
      throw new OcpError(res.status, { code: 'unknown', title: 'Error', status: res.status, body: data });
    }
    return { status: res.status, data, headers: res.headers };
  }

  async createSession(accountId: string, password: string) {
    const { data, status } = await this.request('POST', '/v1/sessions', {
      body: { id: accountId, password },
      anonymous: true,
    });
    return { data, status };
  }

  async createAccount(body: Record<string, unknown>) {
    const { data, status } = await this.request('POST', '/v1/accounts', { body });
    return { data, status };
  }

  async createGrant(body: Record<string, unknown>) {
    const { data, status } = await this.request('POST', '/v1/grants', { body });
    return { data, status };
  }

  async revokeGrant(id: string) {
    const { data } = await this.request('DELETE', `/v1/grants/${id}`);
    return data;
  }

  async listChannels(query?: Query) {
    const { data } = await this.request('GET', '/v1/channels', { query });
    return data;
  }

  async createChannel(body: Record<string, unknown>, idempotencyKey?: string) {
    const { data, status } = await this.request('POST', '/v1/channels', { body, idempotencyKey });
    return { data, status };
  }

  async getChannel(id: string) {
    const { data } = await this.request('GET', `/v1/channels/${id}`);
    return data;
  }

  async updateChannel(id: string, body: Record<string, unknown>) {
    const { data } = await this.request('PATCH', `/v1/channels/${id}`, { body });
    return data;
  }

  async deleteChannel(id: string) {
    const { data } = await this.request('DELETE', `/v1/channels/${id}`);
    return data;
  }

  async listEntries(channelId: string, query?: Query) {
    const { data } = await this.request('GET', `/v1/channels/${channelId}/entries`, { query });
    return data;
  }

  async createEntry(channelId: string, body: Record<string, unknown>, idempotencyKey?: string) {
    const { data, status } = await this.request('POST', `/v1/channels/${channelId}/entries`, {
      body,
      idempotencyKey,
    });
    return { data, status };
  }

  async getEntry(id: string) {
    const { data } = await this.request('GET', `/v1/entries/${id}`);
    return data;
  }

  async deleteEntry(id: string) {
    const { data } = await this.request('DELETE', `/v1/entries/${id}`);
    return data;
  }

  async listLinks(channelId: string, query?: Query) {
    const { data } = await this.request('GET', `/v1/channels/${channelId}/links`, { query });
    return data;
  }

  async createLink(channelId: string, body: Record<string, unknown>, idempotencyKey?: string) {
    const { data, status } = await this.request('POST', `/v1/channels/${channelId}/links`, {
      body,
      idempotencyKey,
    });
    return { data, status };
  }

  async deleteLink(id: string) {
    const { data } = await this.request('DELETE', `/v1/links/${id}`);
    return data;
  }

  async createShare(channelId: string, body: Record<string, unknown>, idempotencyKey?: string) {
    const { data, status } = await this.request('POST', `/v1/channels/${channelId}/shares`, {
      body,
      idempotencyKey,
    });
    return { data, status };
  }

  async getShare(id: string) {
    const { data } = await this.request('GET', `/v1/shares/${id}`);
    return data;
  }

  async revokeShare(id: string) {
    const { data } = await this.request('DELETE', `/v1/shares/${id}`);
    return data;
  }

  async resolveShare(token: string) {
    const url = buildUrl(this.baseUrl, `/s/${token}`);
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    const data = await parseResponse(res);
    if (!res.ok) {
      throw new OcpError(res.status, data as Record<string, unknown>);
    }
    return data;
  }

  async listRevisions(channelId: string) {
    const { data } = await this.request('GET', `/v1/channels/${channelId}/revisions`);
    return data;
  }

  async getRevision(channelId: string, revId: string) {
    const { data } = await this.request('GET', `/v1/channels/${channelId}/revisions/${revId}`);
    return data;
  }

  async restoreRevision(channelId: string, revId: string) {
    const { data } = await this.request('POST', `/v1/channels/${channelId}/revisions/${revId}/restore`, {
      body: {},
    });
    return data;
  }

  async uploadFile(bytes: Uint8Array | Buffer, name: string, mediaType: string) {
    const url = buildUrl(this.baseUrl, '/v1/files');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': mediaType,
        'X-File-Name': encodeURIComponent(name),
      },
      body: bytes as BodyInit,
    });
    const data = await parseResponse(res);
    if (!res.ok) throw new OcpError(res.status, data as Record<string, unknown>);
    return data;
  }

  async downloadFile(id: string): Promise<{ bytes: Buffer; mediaType: string; name: string }> {
    const url = buildUrl(this.baseUrl, `/v1/files/${id}`);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      const data = await parseResponse(res);
      throw new OcpError(res.status, data as Record<string, unknown>);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const mediaType = res.headers.get('content-type') ?? 'application/octet-stream';
    const nameHeader = res.headers.get('x-file-name');
    const name = nameHeader ? decodeURIComponent(nameHeader) : id;
    return { bytes: buf, mediaType, name };
  }
}
