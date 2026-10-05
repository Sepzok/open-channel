import crypto from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';

export const OCP_JSON = 'application/vnd.ocp+json; charset=utf-8';
export const PROBLEM_JSON = 'application/problem+json';

export function nowIso(): string {
  return new Date().toISOString();
}

export function genId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function genShareToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function trimTitle(title: string): string {
  return title.trim();
}

export function titleValid(title: string): boolean {
  const t = trimTitle(title);
  return t.length >= 1 && t.length <= 200;
}

const TYPE_RE = /^[a-z][a-z0-9._-]{0,63}$/;
const ID_RE = /^(ch|en|ln|sh|rev|file|blk)_[a-z0-9_]{1,40}$/;

export function isTypeName(s: string): boolean {
  return TYPE_RE.test(s);
}

export type ExtValue = string | number | boolean;

export function parseExt(
  value: unknown,
): { ok: true; ext?: Record<string, ExtValue> } | { ok: false } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false };
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length > 16) return { ok: false };
  const out: Record<string, ExtValue> = {};
  for (const k of keys) {
    if (!isTypeName(k)) return { ok: false };
    const v = o[k];
    if (typeof v === 'boolean') {
      out[k] = v;
      continue;
    }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return { ok: false };
      out[k] = v;
      continue;
    }
    if (typeof v === 'string') {
      const n = Array.from(v).length;
      if (n < 1 || n > 256) return { ok: false };
      out[k] = v;
      continue;
    }
    return { ok: false };
  }
  if (keys.length === 0) return { ok: true };
  return { ok: true, ext: out };
}

export function isResourceId(s: string): boolean {
  return ID_RE.test(s);
}

export function parseJsonBody(raw: string): { ok: true; value: unknown } | { ok: false; message: string } {
  if (!raw) return { ok: false, message: 'Empty body' };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, message: 'Invalid JSON' };
  }
}

export function assertOnlyKeys(obj: Record<string, unknown>, allowed: string[]): string | null {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) return `Unknown field: ${k}`;
  }
  return null;
}

export function wantsShareJson(accept: string | undefined): boolean {
  if (!accept) return false;
  const parts = accept.split(',').map((p) => {
    const [media, ...rest] = p.trim().split(';');
    const q = rest.find((r) => r.trim().startsWith('q='));
    const quality = q ? parseFloat(q.split('=')[1]!) : 1;
    return { media: media.trim().toLowerCase(), quality };
  });
  const json = parts.find((p) => p.media === 'application/json');
  const html = parts.find((p) => p.media === 'text/html');
  const star = parts.find((p) => p.media === '*/*');
  if (json && !html) return true;
  if (json && html) {
    if (json.quality > html.quality) return true;
    if (json.quality < html.quality) return false;
    const jsonIdx = parts.findIndex((p) => p.media === 'application/json');
    const htmlIdx = parts.findIndex((p) => p.media === 'text/html');
    return jsonIdx < htmlIdx;
  }
  if (star && !json) return false;
  return false;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function parseByteRange(
  header: string | undefined,
  size: number,
):
  | { kind: 'all' }
  | { kind: 'partial'; start: number; end: number }
  | { kind: 'unsatisfiable' }
  | { kind: 'invalid' } {
  if (!header || !header.trim()) return { kind: 'all' };
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith('bytes=')) return { kind: 'invalid' };
  const spec = trimmed.slice(6).trim();
  if (spec.includes(',')) return { kind: 'invalid' };
  const m = /^(\d*)-(\d*)$/.exec(spec);
  if (!m) return { kind: 'invalid' };
  const startRaw = m[1]!;
  const endRaw = m[2]!;
  if (startRaw === '' && endRaw === '') return { kind: 'invalid' };
  if (size <= 0) return { kind: 'unsatisfiable' };
  let start: number;
  let end: number;
  if (startRaw === '') {
    const suffix = parseInt(endRaw, 10);
    if (!Number.isFinite(suffix) || suffix < 1) return { kind: 'invalid' };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = parseInt(startRaw, 10);
    if (!Number.isFinite(start)) return { kind: 'invalid' };
    if (start >= size) return { kind: 'unsatisfiable' };
    end = endRaw === '' ? size - 1 : parseInt(endRaw, 10);
    if (!Number.isFinite(end)) return { kind: 'invalid' };
    if (end < start) return { kind: 'invalid' };
    if (end >= size) end = size - 1;
  }
  return { kind: 'partial', start, end };
}

export function blockTextContent(blocks: { type: string; text?: string; file?: { name: string }; embed?: { title: string } }[]): string {
  return blocks
    .map((b) => {
      if (b.type === 'text') return b.text ?? '';
      if (b.type === 'file') return b.file?.name ?? '';
      if (b.type === 'embed') return b.embed?.title ?? '';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}
