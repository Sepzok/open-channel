import http from 'node:http';
import crypto from 'node:crypto';
import type { Socket } from 'node:net';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export type WsPeer = {
  send: (buf: Buffer) => void;
  close: () => void;
};

export type WsServer = {
  port: number;
  address: string;
  close: () => Promise<void>;
};

function acceptKey(key: string): string {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

export function encodeWsBinary(payload: Buffer): Buffer {
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x82;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x82;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x82;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, payload]);
}

function encodeWsPong(payload: Buffer): Buffer {
  const header = Buffer.alloc(2);
  header[0] = 0x8a;
  header[1] = payload.length;
  return Buffer.concat([header, payload]);
}

type ParseResult =
  | { kind: 'need'; consumed: 0 }
  | { kind: 'binary'; payload: Buffer; consumed: number }
  | { kind: 'ping'; payload: Buffer; consumed: number }
  | { kind: 'close'; consumed: number }
  | { kind: 'skip'; consumed: number };

function parseClientFrame(buf: Buffer): ParseResult {
  if (buf.length < 2) return { kind: 'need', consumed: 0 };
  const b0 = buf[0]!;
  const b1 = buf[1]!;
  const fin = (b0 & 0x80) !== 0;
  const opcode = b0 & 0x0f;
  const masked = (b1 & 0x80) !== 0;
  let len = b1 & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return { kind: 'need', consumed: 0 };
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return { kind: 'need', consumed: 0 };
    const hi = buf.readUInt32BE(2);
    const lo = buf.readUInt32BE(6);
    if (hi !== 0 || lo > 0x100000) return { kind: 'close', consumed: buf.length };
    len = lo;
    offset = 10;
  }
  if (!masked) return { kind: 'close', consumed: buf.length };
  if (buf.length < offset + 4 + len) return { kind: 'need', consumed: 0 };
  const mask = buf.subarray(offset, offset + 4);
  offset += 4;
  const payload = Buffer.alloc(len);
  for (let i = 0; i < len; i++) payload[i] = buf[offset + i]! ^ mask[i % 4]!;
  const consumed = offset + len;
  if (!fin) return { kind: 'skip', consumed };
  if (opcode === 0x2) return { kind: 'binary', payload, consumed };
  if (opcode === 0x9) return { kind: 'ping', payload, consumed };
  if (opcode === 0x8) return { kind: 'close', consumed };
  return { kind: 'skip', consumed };
}

function attachSocket(socket: Socket, onBinary: (payload: Buffer, peer: WsPeer) => void): void {
  let buf = Buffer.alloc(0);
  let closed = false;
  const peer: WsPeer = {
    send: (data) => {
      if (closed || socket.destroyed) return;
      socket.write(encodeWsBinary(data));
    },
    close: () => {
      if (closed) return;
      closed = true;
      socket.end();
    },
  };
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const parsed = parseClientFrame(buf);
      if (parsed.kind === 'need') return;
      buf = buf.subarray(parsed.consumed);
      if (parsed.kind === 'binary') {
        onBinary(parsed.payload, peer);
      } else if (parsed.kind === 'ping') {
        if (!socket.destroyed) socket.write(encodeWsPong(parsed.payload));
      } else if (parsed.kind === 'close') {
        peer.close();
        return;
      }
    }
  });
  socket.on('error', () => {
    closed = true;
  });
  socket.on('close', () => {
    closed = true;
  });
}

export function createWsServer(
  bindHost: string,
  port: number,
  onBinary: (payload: Buffer, peer: WsPeer) => void,
): Promise<WsServer> {
  const server = http.createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });

  server.on('upgrade', (req, socket, head) => {
    const key = req.headers['sec-websocket-key'];
    if (typeof key !== 'string' || req.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.destroy();
      return;
    }
    const accept = acceptKey(key);
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n` +
        '\r\n',
    );
    if (head.length) socket.unshift(head);
    attachSocket(socket, onBinary);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, bindHost, () => {
      const addr = server.address();
      const p = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        port: p,
        address: `ws://${bindHost}:${p}`,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
