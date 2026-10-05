import { isTypeName } from './util.js';

export type ExtValue = string | number | boolean;

export type FilterKind = 'channel' | 'entry' | 'link';

export type FilterTarget = {
  id: string;
  type: string;
  title?: string;
  ext?: Record<string, ExtValue>;
};

type CompOp = 'eq' | 'ne' | 'co' | 'sw' | 'ew' | 'gt' | 'ge' | 'lt' | 'le';

type Node =
  | { kind: 'pr'; path: string }
  | { kind: 'cmp'; path: string; op: CompOp; value: ExtValue }
  | { kind: 'not'; inner: Node }
  | { kind: 'and'; left: Node; right: Node }
  | { kind: 'or'; left: Node; right: Node };

export type ParseFilterResult = { ok: true; ast: Node } | { ok: false; message: string };

const MAX_FILTER_CP = 1024;
const MAX_DEPTH = 4;
const MAX_ATOMS = 16;
const CMP_OPS = new Set<string>(['eq', 'ne', 'co', 'sw', 'ew', 'gt', 'ge', 'lt', 'le']);
const NUM_OPS = new Set<CompOp>(['gt', 'ge', 'lt', 'le']);
const STR_OPS = new Set<CompOp>(['co', 'sw', 'ew']);

function codePointLength(s: string): number {
  return Array.from(s).length;
}

function isAllowedPath(path: string, kind: FilterKind): boolean {
  if (path === 'id' || path === 'type') return true;
  if (path === 'title') return kind === 'channel' || kind === 'link';
  if (!path.startsWith('ext.')) return false;
  const key = path.slice(4);
  return isTypeName(key);
}

class Parser {
  readonly s: string;
  readonly kind: FilterKind;
  i = 0;
  depth = 0;
  atoms = 0;

  constructor(s: string, kind: FilterKind) {
    this.s = s;
    this.kind = kind;
  }

  fail(message: string): never {
    throw new Error(message);
  }

  skipWs(): void {
    while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i += 1;
  }

  peekWord(): string | null {
    this.skipWs();
    const m = this.s.slice(this.i).match(/^[A-Za-z]+/);
    return m ? m[0] : null;
  }

  eatWord(expected?: string): string {
    this.skipWs();
    const m = this.s.slice(this.i).match(/^[A-Za-z]+/);
    if (!m) this.fail('expected keyword');
    const w = m[0]!;
    if (expected && w.toLowerCase() !== expected) this.fail(`expected ${expected}`);
    this.i += w.length;
    return w.toLowerCase();
  }

  parse(): Node {
    const n = this.parseOr();
    this.skipWs();
    if (this.i !== this.s.length) this.fail('trailing input');
    return n;
  }

  parseOr(): Node {
    let left = this.parseAnd();
    for (;;) {
      const w = this.peekWord();
      if (!w || w.toLowerCase() !== 'or') break;
      this.eatWord('or');
      left = { kind: 'or', left, right: this.parseAnd() };
    }
    return left;
  }

  parseAnd(): Node {
    let left = this.parseNot();
    for (;;) {
      const w = this.peekWord();
      if (!w || w.toLowerCase() !== 'and') break;
      this.eatWord('and');
      left = { kind: 'and', left, right: this.parseNot() };
    }
    return left;
  }

  parseNot(): Node {
    this.skipWs();
    const w = this.peekWord();
    if (w && w.toLowerCase() === 'not') {
      this.eatWord('not');
      this.skipWs();
      if (this.s[this.i] !== '(') this.fail('not requires parentheses');
      return { kind: 'not', inner: this.parsePrimary() };
    }
    return this.parsePrimary();
  }

  parsePrimary(): Node {
    this.skipWs();
    if (this.s[this.i] === '(') {
      this.i += 1;
      this.depth += 1;
      if (this.depth > MAX_DEPTH) this.fail('parentheses too deep');
      const inner = this.parseOr();
      this.skipWs();
      if (this.s[this.i] !== ')') this.fail('expected )');
      this.i += 1;
      this.depth -= 1;
      return inner;
    }
    return this.parseAttr();
  }

  parseAttr(): Node {
    this.skipWs();
    const pathM = this.s.slice(this.i).match(/^[A-Za-z][A-Za-z0-9._-]*/);
    if (!pathM) this.fail('expected attribute');
    const path = pathM[0]!;
    this.i += path.length;
    if (!isAllowedPath(path, this.kind)) this.fail(`unknown attribute ${path}`);
    this.skipWs();
    const w = this.peekWord();
    if (!w) this.fail('expected operator');
    const op = w.toLowerCase();
    this.eatWord();
    this.atoms += 1;
    if (this.atoms > MAX_ATOMS) this.fail('too many predicates');
    if (op === 'pr') return { kind: 'pr', path };
    if (!CMP_OPS.has(op)) this.fail(`unknown operator ${op}`);
    const value = this.parseValue();
    const cmp = op as CompOp;
    if (NUM_OPS.has(cmp) && typeof value !== 'number') this.fail('numeric comparison needs number');
    if (STR_OPS.has(cmp) && typeof value !== 'string') this.fail('string operator needs string');
    return { kind: 'cmp', path, op: cmp, value };
  }

  parseValue(): ExtValue {
    this.skipWs();
    if (this.s[this.i] === '"') return this.parseString();
    const w = this.peekWord();
    if (w && (w.toLowerCase() === 'true' || w.toLowerCase() === 'false')) {
      this.eatWord();
      return w.toLowerCase() === 'true';
    }
    if (w && w.toLowerCase() === 'null') this.fail('null is not allowed');
    const numM = this.s.slice(this.i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (numM) {
      this.i += numM[0]!.length;
      const n = Number(numM[0]);
      if (!Number.isFinite(n)) this.fail('invalid number');
      return n;
    }
    this.fail('invalid literal');
  }

  parseString(): string {
    this.i += 1;
    let out = '';
    while (this.i < this.s.length) {
      const c = this.s[this.i]!;
      if (c === '"') {
        this.i += 1;
        return out;
      }
      if (c === '\\') {
        const n = this.s[this.i + 1];
        if (n === '"' || n === '\\') {
          out += n;
          this.i += 2;
          continue;
        }
        this.fail('invalid escape');
      }
      out += c;
      this.i += 1;
    }
    this.fail('unterminated string');
  }
}

export function parseScimFilter(input: string, kind: FilterKind = 'channel'): ParseFilterResult {
  if (codePointLength(input) > MAX_FILTER_CP) return { ok: false, message: 'filter too long' };
  try {
    const ast = new Parser(input, kind).parse();
    return { ok: true, ast };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'invalid filter' };
  }
}

export function parseListFilterQuery(
  searchParams: URLSearchParams,
  kind: FilterKind,
): { ok: true; match?: (t: FilterTarget) => boolean } | { ok: false; path: string; message: string } {
  for (const key of searchParams.keys()) {
    if (key.startsWith('ext.')) return { ok: false, path: key, message: 'use filter' };
  }
  const filters = searchParams.getAll('filter');
  if (filters.length > 1) return { ok: false, path: 'filter', message: 'duplicate' };
  if (filters.length === 0) return { ok: true };
  const parsed = parseScimFilter(filters[0]!, kind);
  if (!parsed.ok) return { ok: false, path: 'filter', message: parsed.message };
  const ast = parsed.ast;
  return { ok: true, match: (t) => matchScimFilter(t, ast) };
}

export function scimContains(attr: string, needle: string): string {
  const escaped = needle.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${attr} co "${escaped}"`;
}

function readAttr(ch: FilterTarget, path: string): { present: boolean; value?: ExtValue } {
  if (path === 'id') return { present: true, value: ch.id };
  if (path === 'type') return { present: true, value: ch.type };
  if (path === 'title') {
    if (ch.title === undefined) return { present: false };
    return { present: true, value: ch.title };
  }
  if (path.startsWith('ext.')) {
    const key = path.slice(4);
    if (!ch.ext || !Object.prototype.hasOwnProperty.call(ch.ext, key)) return { present: false };
    return { present: true, value: ch.ext[key] };
  }
  return { present: false };
}

function evalNode(ch: FilterTarget, node: Node): boolean {
  if (node.kind === 'not') return !evalNode(ch, node.inner);
  if (node.kind === 'and') return evalNode(ch, node.left) && evalNode(ch, node.right);
  if (node.kind === 'or') return evalNode(ch, node.left) || evalNode(ch, node.right);
  const got = readAttr(ch, node.path);
  if (node.kind === 'pr') return got.present;
  if (!got.present) return false;
  const stored = got.value!;
  const q = node.value;
  if (node.op === 'eq') return typeof stored === typeof q && stored === q;
  if (node.op === 'ne') return typeof stored === typeof q && stored !== q;
  if (typeof stored !== 'string' || typeof q !== 'string') {
    if (STR_OPS.has(node.op)) return false;
  }
  if (node.op === 'co') return typeof stored === 'string' && stored.includes(q as string);
  if (node.op === 'sw') return typeof stored === 'string' && stored.startsWith(q as string);
  if (node.op === 'ew') return typeof stored === 'string' && stored.endsWith(q as string);
  if (typeof stored !== 'number' || typeof q !== 'number') return false;
  if (node.op === 'gt') return stored > q;
  if (node.op === 'ge') return stored >= q;
  if (node.op === 'lt') return stored < q;
  if (node.op === 'le') return stored <= q;
  return false;
}

export function matchScimFilter(ch: FilterTarget, ast: Node): boolean {
  return evalNode(ch, ast);
}
