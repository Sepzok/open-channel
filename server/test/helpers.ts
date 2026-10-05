import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/index.js';
import type { AppOptions, Capabilities, Seed } from '../src/types.js';

export const CHAT_CAPS: Capabilities = {
  body: false,
  entries: true,
  entry_threads: true,
  links: true,
  shares: true,
  revisions: false,
};

export const TASKS_CAPS: Capabilities = {
  body: true,
  entries: true,
  entry_threads: false,
  links: true,
  shares: true,
  revisions: true,
};

export const NOTES_CAPS: Capabilities = {
  body: true,
  entries: true,
  entry_threads: false,
  links: true,
  shares: true,
  revisions: true,
};

export const ACTOR = { id: 'u_fuse', display_name: '融合台' };

export function tempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ocp-test-'));
}

export function loadSeed(name: 'chat' | 'tasks' | 'notes'): Seed {
  const p = path.join(process.cwd(), 'examples', name, 'seed.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Seed;
}

export async function startServer(
  partial: Partial<AppOptions> & { capabilities: Capabilities; providerId: string; seed?: Seed },
): Promise<{ baseUrl: string; dataDir: string; close: () => Promise<void> }> {
  const dataDir = partial.dataDir ?? tempDataDir();
  const server = createApp({
    providerId: partial.providerId,
    providerName: partial.providerName ?? partial.providerId,
    capabilities: partial.capabilities,
    actor: partial.actor ?? ACTOR,
    token: partial.token ?? 'demo-token',
    seed: partial.seed,
    dataDir,
    publicOrigin: partial.publicOrigin ?? 'http://127.0.0.1:0',
    maxFileBytes: partial.maxFileBytes,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    baseUrl,
    dataDir,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export async function httpJson(
  baseUrl: string,
  method: string,
  pathname: string,
  opts?: { token?: string | null; body?: unknown; headers?: Record<string, string> },
): Promise<{ status: number; headers: Headers; body: unknown; raw: string }> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.ocp+json',
    ...opts?.headers,
  };
  if (opts?.token === null) {
    /* no auth */
  } else {
    headers.Authorization = `Bearer ${opts?.token ?? 'demo-token'}`;
  }
  let bodyStr: string | undefined;
  if (opts?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(opts.body);
  }
  const res = await fetch(`${baseUrl}${pathname}`, { method, headers, body: bodyStr });
  const raw = await res.text();
  let body: unknown = raw;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    /* text */
  }
  return { status: res.status, headers: res.headers, body, raw };
}
