import dgram from 'node:dgram';
import type { RemoteInfo } from 'node:dgram';
import { decodeFrame, encodeFrame, type FrameKind } from './frame.js';
import { verifyAdmission } from './ticket.js';

export type InputBatch = { actorId: string; kind: 'input' | 'event'; payload: Buffer }[];

export type MatchHostOptions<S> = {
  secret: string;
  port?: number;
  host?: string;
  tickMs?: number;
  initialState: S;
  reduce: (prev: S, batch: InputBatch) => S;
  encode: (state: S) => Buffer;
  shouldEnd?: (state: S) => boolean;
  onEnd?: (channelId: string, snapshot: Buffer) => void;
};

type Peer = {
  actorId: string;
  rinfo: RemoteInfo;
  lastEventSeq: number;
  lastInputSeq: number;
};

type ChannelMatch<S> = {
  state: S;
  snapshot: Buffer;
  peers: Map<string, Peer>;
  ended: boolean;
  pending: InputBatch;
};

export type MatchHost<S> = {
  port: number;
  address: string;
  close: () => Promise<void>;
  hasChannel: (channelId: string) => boolean;
  peerCount: (channelId: string) => number;
  snapshotOf: (channelId: string) => Buffer | undefined;
  reduceCalls: number;
  endCalls: number;
};

export function createMatchHost<S>(options: MatchHostOptions<S>): Promise<MatchHost<S>> {
  const sock = dgram.createSocket('udp4');
  const bindHost = options.host ?? '127.0.0.1';
  const tickMs = options.tickMs ?? 50;
  const matches = new Map<string, ChannelMatch<S>>();
  const usedTickets = new Set<string>();
  let reduceCalls = 0;
  let endCalls = 0;
  let closed = false;

  function broadcast(chId: string, m: ChannelMatch<S>): void {
    const pkt = encodeFrame({
      kind: 'snapshot',
      seq: 0,
      channelId: chId,
      actorId: 'host',
      payload: m.snapshot,
    });
    for (const peer of m.peers.values()) {
      sock.send(pkt, peer.rinfo.port, peer.rinfo.address);
    }
  }

  function finish(chId: string, m: ChannelMatch<S>): void {
    if (m.ended) return;
    m.ended = true;
    endCalls += 1;
    options.onEnd?.(chId, m.snapshot);
    matches.delete(chId);
  }

  const timer = setInterval(() => {
    for (const [chId, m] of matches) {
      if (m.ended) continue;
      if (m.pending.length > 0) {
        reduceCalls += 1;
        m.state = options.reduce(m.state, m.pending);
        m.snapshot = options.encode(m.state);
        m.pending = [];
      }
      if (m.peers.size > 0) broadcast(chId, m);
      if (options.shouldEnd?.(m.state)) {
        finish(chId, m);
      }
    }
  }, tickMs);

  sock.on('message', (msg, rinfo) => {
    const frame = decodeFrame(msg);
    if (!frame) return;
    if (frame.kind === 'join') {
      const claims = verifyAdmission(options.secret, frame.payload.toString('utf8'));
      if (!claims) return;
      if (claims.channelId !== frame.channelId) return;
      if (claims.actorId !== frame.actorId) return;
      if (usedTickets.has(claims.id)) return;
      usedTickets.add(claims.id);
      let m = matches.get(claims.channelId);
      if (!m) {
        const state = structuredClone(options.initialState);
        m = {
          state,
          snapshot: options.encode(state),
          peers: new Map(),
          ended: false,
          pending: [],
        };
        matches.set(claims.channelId, m);
      }
      if (m.ended) return;
      m.peers.set(claims.actorId, {
        actorId: claims.actorId,
        rinfo,
        lastEventSeq: 0,
        lastInputSeq: 0,
      });
      sock.send(
        encodeFrame({
          kind: 'snapshot',
          seq: 0,
          channelId: claims.channelId,
          actorId: 'host',
          payload: m.snapshot,
        }),
        rinfo.port,
        rinfo.address,
      );
      return;
    }

    const m = matches.get(frame.channelId);
    if (!m || m.ended) return;
    const peer = m.peers.get(frame.actorId);
    if (!peer) return;
    peer.rinfo = rinfo;

    if (frame.kind === 'input') {
      if (frame.seq <= peer.lastInputSeq) return;
      peer.lastInputSeq = frame.seq;
      m.pending.push({ actorId: frame.actorId, kind: 'input', payload: frame.payload });
      return;
    }

    if (frame.kind === 'event') {
      if (frame.seq !== peer.lastEventSeq + 1) {
        return;
      }
      peer.lastEventSeq = frame.seq;
      m.pending.push({ actorId: frame.actorId, kind: 'event', payload: frame.payload });
    }
  });

  return new Promise((resolve, reject) => {
    sock.once('error', reject);
    sock.bind(options.port ?? 0, bindHost, () => {
      const addr = sock.address();
      const port = typeof addr === 'object' ? addr.port : 0;
      const host: MatchHost<S> = {
        port,
        address: `udp://${bindHost}:${port}`,
        hasChannel: (id) => matches.has(id),
        peerCount: (id) => matches.get(id)?.peers.size ?? 0,
        snapshotOf: (id) => matches.get(id)?.snapshot,
        get reduceCalls() {
          return reduceCalls;
        },
        get endCalls() {
          return endCalls;
        },
        close: () =>
          new Promise((res, rej) => {
            if (closed) {
              res();
              return;
            }
            closed = true;
            clearInterval(timer);
            sock.close((err) => (err ? rej(err) : res()));
          }),
      };
      resolve(host);
    });
  });
}

export function sendFrame(
  sock: dgram.Socket,
  host: string,
  port: number,
  frame: { kind: FrameKind; seq: number; channelId: string; actorId: string; payload: Buffer },
): void {
  sock.send(encodeFrame(frame), port, host);
}
