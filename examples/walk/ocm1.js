const MAGIC = new Uint8Array([0x4f, 0x43, 0x4d, 0x31]); // OCM1

const KIND = { join: 0, input: 1, event: 2, snapshot: 3 };
const KIND_NAME = ['join', 'input', 'event', 'snapshot'];

/**
 * @param {object} frame
 * @param {string} frame.kind
 * @param {number} frame.seq
 * @param {string} frame.channelId
 * @param {string} frame.actorId
 * @param {Uint8Array} frame.payload
 * @returns {Uint8Array}
 */
export function encodeOcm1(frame) {
  const ch = new TextEncoder().encode(frame.channelId);
  const actor = new TextEncoder().encode(frame.actorId);
  const header = new Uint8Array(11);
  header.set(MAGIC, 0);
  header[4] = KIND[frame.kind];
  const seq = frame.seq >>> 0;
  header[5] = seq & 0xff;
  header[6] = (seq >>> 8) & 0xff;
  header[7] = (seq >>> 16) & 0xff;
  header[8] = (seq >>> 24) & 0xff;
  header[9] = ch.length;
  header[10] = actor.length;
  const out = new Uint8Array(11 + ch.length + actor.length + frame.payload.length);
  out.set(header, 0);
  out.set(ch, 11);
  out.set(actor, 11 + ch.length);
  out.set(frame.payload, 11 + ch.length + actor.length);
  return out;
}

/**
 * @param {Uint8Array} buf
 */
export function decodeOcm1(buf) {
  if (buf.length < 11) return null;
  for (let i = 0; i < 4; i++) if (buf[i] !== MAGIC[i]) return null;
  const kind = KIND_NAME[buf[4]];
  if (!kind) return null;
  const seq = buf[5] | (buf[6] << 8) | (buf[7] << 16) | (buf[8] << 24);
  const chLen = buf[9];
  const actorLen = buf[10];
  if (buf.length < 11 + chLen + actorLen) return null;
  const dec = new TextDecoder();
  const channelId = dec.decode(buf.subarray(11, 11 + chLen));
  const actorId = dec.decode(buf.subarray(11 + chLen, 11 + chLen + actorLen));
  const payload = buf.subarray(11 + chLen + actorLen);
  return { kind, seq: seq >>> 0, channelId, actorId, payload };
}
