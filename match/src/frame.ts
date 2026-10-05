export const FRAME_MAGIC = Buffer.from('OCM1');

export type FrameKind = 'join' | 'input' | 'event' | 'snapshot';

const KIND_TO_BYTE: Record<FrameKind, number> = {
  join: 0,
  input: 1,
  event: 2,
  snapshot: 3,
};

const BYTE_TO_KIND: FrameKind[] = ['join', 'input', 'event', 'snapshot'];

export type Frame = {
  kind: FrameKind;
  seq: number;
  channelId: string;
  actorId: string;
  payload: Buffer;
};

export function encodeFrame(frame: Frame): Buffer {
  const ch = Buffer.from(frame.channelId, 'utf8');
  const actor = Buffer.from(frame.actorId, 'utf8');
  if (ch.length > 255 || actor.length > 255) throw new Error('id too long');
  const header = Buffer.alloc(4 + 1 + 4 + 1 + 1);
  FRAME_MAGIC.copy(header, 0);
  header.writeUInt8(KIND_TO_BYTE[frame.kind], 4);
  header.writeUInt32LE(frame.seq >>> 0, 5);
  header.writeUInt8(ch.length, 9);
  header.writeUInt8(actor.length, 10);
  return Buffer.concat([header, ch, actor, frame.payload]);
}

export function decodeFrame(buf: Buffer): Frame | null {
  if (buf.length < 11) return null;
  if (!buf.subarray(0, 4).equals(FRAME_MAGIC)) return null;
  const kind = BYTE_TO_KIND[buf.readUInt8(4)];
  if (!kind) return null;
  const seq = buf.readUInt32LE(5);
  const chLen = buf.readUInt8(9);
  const actorLen = buf.readUInt8(10);
  if (buf.length < 11 + chLen + actorLen) return null;
  const channelId = buf.subarray(11, 11 + chLen).toString('utf8');
  const actorId = buf.subarray(11 + chLen, 11 + chLen + actorLen).toString('utf8');
  const payload = Buffer.from(buf.subarray(11 + chLen + actorLen));
  return { kind, seq, channelId, actorId, payload };
}
