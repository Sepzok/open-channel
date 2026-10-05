import dgram from 'node:dgram';
import { decodeFrame, encodeFrame, type FrameKind } from './frame.js';
import { verifyAdmission } from './ticket.js';
import { createWsServer, type WsPeer, type WsServer } from './ws.js';

export type InputBatch = { actorId: string; kind: 'input' | 'event'; payload: Buffer }[];

export type MatchHostOptions<S> = {
  secret: string;
  port?: number;
  wsPort?: number;
  host?: string;
  tickMs?: number;
  /** 默认 true。浏览器没有裸 UDP 时走同一套帧的 WebSocket 入口。 */
  websocket?: boolean;
  initialState: S;
  reduce: (prev: S, batch: InputBatch) => S;
  encode: (state: S) => Buffer;
  shouldEnd?: (state: S) => boolean;
  onEnd?: (channelId: string, snapshot: Buffer) => void;
};

type Peer = {
  actorId: string;
  send: (buf: Buffer) => void;
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
  wsPort: number | null;
  wsAddress: string | null;
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
  let wsServer: WsServer | null = null;

  function broadcast(chId: string, m: ChannelMatch<S>): void {
    const pkt = encodeFrame({
      kind: 'snapshot',
      seq: 0,
      channelId: chId,
      actorId: 'host',
      payload: m.snapshot,
    });
    for (const peer of m.peers.values()) {
      peer.send(pkt);
    }
  }

  function finish(chId: string, m: ChannelMatch<S>): void {
    if (m.ended) return;
    m.ended = true;
    endCalls += 1;
    options.onEnd?.(chId, m.snapshot);
    matches.delete(chId);
  }

  function handleFrame(msg: Buffer, send: (buf: Buffer) => void): void {
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
        send,
        lastEventSeq: 0,
        lastInputSeq: 0,
      });
      send(
        encodeFrame({
          kind: 'snapshot',
          seq: 0,
          channelId: claims.channelId,
          actorId: 'host',
          payload: m.snapshot,
        }),
      );
      return;
    }

    const m = matches.get(frame.channelId);
    if (!m || m.ended) return;
    const peer = m.peers.get(frame.actorId);
    if (!peer) return;
    peer.send = send;

    if (frame.kind === 'input') {
      if (frame.seq <= peer.lastInputSeq) return;
      peer.lastInputSeq = frame.seq;
      m.pending.push({ actorId: frame.actorId, kind: 'input', payload: frame.payload });
      return;
    }

    if (frame.kind === 'event') {
      if (frame.seq !== peer.lastEventSeq + 1) return;
      peer.lastEventSeq = frame.seq;
      m.pending.push({ actorId: frame.actorId, kind: 'event', payload: frame.payload });
    }
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
    handleFrame(msg, (buf) => {
      sock.send(buf, rinfo.port, rinfo.address);
    });
  });

  const enableWs = options.websocket !== false;

  return new Promise((resolve, reject) => {
    sock.once('error', reject);
    sock.bind(options.port ?? 0, bindHost, () => {
      const addr = sock.address();
      const port = typeof addr === 'object' ? addr.port : 0;

      const finishHost = () => {
        const host: MatchHost<S> = {
          port,
          address: `udp://${bindHost}:${port}`,
          wsPort: wsServer ? wsServer.port : null,
          wsAddress: wsServer ? wsServer.address : null,
          hasChannel: (id) => matches.has(id),
          peerCount: (id) => matches.get(id)?.peers.size ?? 0,
          snapshotOf: (id) => matches.get(id)?.snapshot,
          get reduceCalls() {
            return reduceCalls;
          },
          get endCalls() {
            return endCalls;
          },
          close: async () => {
            if (closed) return;
            closed = true;
            clearInterval(timer);
            await new Promise<void>((res, rej) => {
              sock.close((err) => (err ? rej(err) : res()));
            });
            if (wsServer) await wsServer.close();
          },
        };
        resolve(host);
      };

      if (!enableWs) {
        finishHost();
        return;
      }

      createWsServer(bindHost, options.wsPort ?? 0, (payload, peer: WsPeer) => {
        handleFrame(payload, (buf) => peer.send(buf));
      })
        .then((ws) => {
          wsServer = ws;
          finishHost();
        })
        .catch(reject);
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

export function sendFrameWs(
  ws: WebSocket,
  frame: { kind: FrameKind; seq: number; channelId: string; actorId: string; payload: Buffer },
): void {
  ws.send(encodeFrame(frame));
}

export function openMatchWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', () => reject(new Error('websocket open failed')));
  });
}
