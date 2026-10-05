import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { createMatchHost, sendFrame, signAdmission, verifyAdmission, decodeFrame } from '../src/index.js';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function waitFor(fn: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (fn()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('timeout'));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe('match host', () => {
  it('rejects expired share and wrong-channel tokens without reduce', async () => {
    const secret = 's1';
    let reduceCalls = 0;
    const host = await createMatchHost({
      secret,
      tickMs: 20,
      initialState: 0,
      reduce: (n, batch) => {
        reduceCalls += 1;
        return n + batch.reduce((s, b) => s + b.payload.length, 0);
      },
      encode: (n) => Buffer.from(String(n)),
    });
    const sock = dgram.createSocket('udp4');
    const expired = signAdmission(secret, {
      id: 'ad_old',
      channelId: 'ch_a',
      actorId: 'u_lin',
      exp: new Date(Date.now() - 1000).toISOString(),
    });
    sendFrame(sock, '127.0.0.1', host.port, {
      kind: 'join',
      seq: 0,
      channelId: 'ch_a',
      actorId: 'u_lin',
      payload: Buffer.from(expired),
    });
    sendFrame(sock, '127.0.0.1', host.port, {
      kind: 'join',
      seq: 0,
      channelId: 'ch_a',
      actorId: 'u_lin',
      payload: Buffer.from('not-a-share-but-looks-like-token'),
    });
    const ok = signAdmission(secret, {
      id: 'ad_ok',
      channelId: 'ch_a',
      actorId: 'u_lin',
      exp: new Date(Date.now() + 60_000).toISOString(),
    });
    sendFrame(sock, '127.0.0.1', host.port, {
      kind: 'join',
      seq: 0,
      channelId: 'ch_b',
      actorId: 'u_lin',
      payload: Buffer.from(ok),
    });
    await sleep(80);
    assert.equal(host.hasChannel('ch_a'), false);
    assert.equal(host.hasChannel('ch_b'), false);
    assert.equal(host.reduceCalls, 0);
    assert.equal(reduceCalls, 0);
    sock.close();
    await host.close();
  });

  it('does not change snapshot when reduce is not called', async () => {
    const secret = 's2';
    const token = signAdmission(secret, {
      id: 'ad_j',
      channelId: 'ch_c',
      actorId: 'u_lin',
      exp: new Date(Date.now() + 60_000).toISOString(),
    });
    const host = await createMatchHost({
      secret,
      tickMs: 20,
      initialState: 0,
      reduce: () => {
        throw new Error('reduce must not run');
      },
      encode: (n) => Buffer.from(`n=${n}`),
    });
    const sock = dgram.createSocket('udp4');
    sendFrame(sock, '127.0.0.1', host.port, {
      kind: 'join',
      seq: 0,
      channelId: 'ch_c',
      actorId: 'u_lin',
      payload: Buffer.from(token),
    });
    await waitFor(() => host.hasChannel('ch_c'));
    const first = host.snapshotOf('ch_c')!.toString();
    await sleep(70);
    assert.equal(host.snapshotOf('ch_c')!.toString(), first);
    assert.equal(host.reduceCalls, 0);
    sock.close();
    await host.close();
  });

  it('sums opaque input lengths from two actors', async () => {
    const secret = 's3';
    const exp = new Date(Date.now() + 60_000).toISOString();
    const t1 = signAdmission(secret, { id: 'ad_1', channelId: 'ch_d', actorId: 'u_lin', exp });
    const t2 = signAdmission(secret, { id: 'ad_2', channelId: 'ch_d', actorId: 'u_zhou', exp });
    let ended = 0;
    const host = await createMatchHost({
      secret,
      tickMs: 20,
      initialState: 0,
      reduce: (n, batch) => n + batch.reduce((s, b) => s + b.payload.length, 0),
      encode: (n) => Buffer.from(String(n)),
      shouldEnd: (n) => n >= 2,
      onEnd: () => {
        ended += 1;
      },
    });
    const a = dgram.createSocket('udp4');
    const b = dgram.createSocket('udp4');
    sendFrame(a, '127.0.0.1', host.port, {
      kind: 'join',
      seq: 0,
      channelId: 'ch_d',
      actorId: 'u_lin',
      payload: Buffer.from(t1),
    });
    sendFrame(b, '127.0.0.1', host.port, {
      kind: 'join',
      seq: 0,
      channelId: 'ch_d',
      actorId: 'u_zhou',
      payload: Buffer.from(t2),
    });
    await waitFor(() => host.hasChannel('ch_d'));
    sendFrame(a, '127.0.0.1', host.port, {
      kind: 'input',
      seq: 1,
      channelId: 'ch_d',
      actorId: 'u_lin',
      payload: Buffer.from([1]),
    });
    sendFrame(b, '127.0.0.1', host.port, {
      kind: 'input',
      seq: 1,
      channelId: 'ch_d',
      actorId: 'u_zhou',
      payload: Buffer.from([1]),
    });
    await waitFor(() => ended === 1);
    assert.equal(host.hasChannel('ch_d'), false);
    assert.equal(ended, 1);
    assert.equal(host.endCalls, 1);
    a.close();
    b.close();
    await host.close();
  });

  it('applies input while an event sequence has a gap', async () => {
    const secret = 's4';
    const token = signAdmission(secret, {
      id: 'ad_e',
      channelId: 'ch_e',
      actorId: 'u_lin',
      exp: new Date(Date.now() + 60_000).toISOString(),
    });
    const host = await createMatchHost({
      secret,
      tickMs: 20,
      initialState: 0,
      reduce: (n, batch) => n + batch.reduce((s, b) => s + (b.kind === 'input' ? b.payload.length : 0), 0),
      encode: (n) => Buffer.from(String(n)),
    });
    const sock = dgram.createSocket('udp4');
    sendFrame(sock, '127.0.0.1', host.port, {
      kind: 'join',
      seq: 0,
      channelId: 'ch_e',
      actorId: 'u_lin',
      payload: Buffer.from(token),
    });
    await waitFor(() => host.hasChannel('ch_e'));
    sendFrame(sock, '127.0.0.1', host.port, {
      kind: 'event',
      seq: 2,
      channelId: 'ch_e',
      actorId: 'u_lin',
      payload: Buffer.from('late'),
    });
    sendFrame(sock, '127.0.0.1', host.port, {
      kind: 'input',
      seq: 1,
      channelId: 'ch_e',
      actorId: 'u_lin',
      payload: Buffer.from([9]),
    });
    await waitFor(() => host.reduceCalls >= 1);
    assert.equal(host.snapshotOf('ch_e')!.toString(), '1');
    sock.close();
    await host.close();
  });

  it('verifyAdmission rejects expired claims', () => {
    const secret = 's5';
    const tok = signAdmission(secret, {
      id: 'ad_x',
      channelId: 'ch_x',
      actorId: 'u_lin',
      exp: new Date(Date.now() - 5).toISOString(),
    });
    assert.equal(verifyAdmission(secret, tok), null);
    const live = signAdmission(secret, {
      id: 'ad_y',
      channelId: 'ch_x',
      actorId: 'u_lin',
      exp: new Date(Date.now() + 30_000).toISOString(),
    });
    assert.equal(verifyAdmission(secret, live)?.actorId, 'u_lin');
    assert.ok(decodeFrame(Buffer.from('xxxx')) === null);
  });

  it('consumes a ticket after the first join', async () => {
    const secret = 's6';
    const token = signAdmission(secret, {
      id: 'ad_once',
      channelId: 'ch_f',
      actorId: 'u_lin',
      exp: new Date(Date.now() + 60_000).toISOString(),
    });
    const host = await createMatchHost({
      secret,
      tickMs: 20,
      initialState: { n: 0 },
      reduce: (s) => s,
      encode: (s) => Buffer.from(String(s.n)),
    });
    const a = dgram.createSocket('udp4');
    sendFrame(a, '127.0.0.1', host.port, {
      kind: 'join',
      seq: 0,
      channelId: 'ch_f',
      actorId: 'u_lin',
      payload: Buffer.from(token),
    });
    await waitFor(() => host.peerCount('ch_f') === 1);
    sendFrame(a, '127.0.0.1', host.port, {
      kind: 'join',
      seq: 0,
      channelId: 'ch_f',
      actorId: 'u_lin',
      payload: Buffer.from(token),
    });
    await sleep(40);
    assert.equal(host.peerCount('ch_f'), 1);
    a.close();
    await host.close();
  });
});
