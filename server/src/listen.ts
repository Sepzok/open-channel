import os from 'node:os';

export function bindHost(): string {
  const h = process.env.HOST?.trim();
  return h && h.length > 0 ? h : '127.0.0.1';
}

export function firstLanIPv4(): string | null {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const n of list ?? []) {
      if (n.family === 'IPv4' && !n.internal) return n.address;
    }
  }
  return null;
}

export function originAfterListen(bind: string, port: number): string {
  if (bind === '0.0.0.0' || bind === '::') {
    return `http://${firstLanIPv4() ?? '127.0.0.1'}:${port}`;
  }
  const host = bind === '::1' ? '127.0.0.1' : bind;
  return `http://${host}:${port}`;
}
