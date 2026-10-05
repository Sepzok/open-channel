import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { Client } from '@open-channel/sdk';
import { createMatchHost, sendFrame } from '@open-channel/match';
import { LIVE_CAPS, loadSeed, startServer } from '../../../server/test/helpers.js';
import { encodeWalk, initialWalk, reduceWalk, walkShouldEnd } from '../game.js';

function waitFor(fn: () => Promise<boolean> | boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await fn()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('timeout'));
        return;
      }
      setTimeout(() => void tick(), 20);
    };
    void tick();
  });
}

describe('walk example caller', () => {
  it('moves two actors then writes a discussion', async () => {
    const secret = 'walk-test-secret';
    let posted = false;
    let http: Awaited<ReturnType<typeof startServer>> | undefined;
    const match = await createMatchHost({
      secret,
      tickMs: 20,
      initialState: initialWalk(),
      reduce: reduceWalk,
      encode: encodeWalk,
      shouldEnd: walkShouldEnd,
      onEnd: async (channelId) => {
        const client = new Client({ baseUrl: http!.baseUrl, token: 'demo-token' });
        await client.createEntry(channelId, {
          type: 'message',
          body: [{ type: 'text', text: '对局已结束', format: 'plain' }],
          parent_id: null,
          anchor: null,
        });
        posted = true;
      },
    });
    http = await startServer({
      providerId: 'walk',
      capabilities: LIVE_CAPS,
      seed: loadSeed('walk'),
      liveUrl: match.address,
      liveSecret: secret,
    });
    const client = new Client({ baseUrl: http.baseUrl, token: 'demo-token' });
    const linSession = await client.createSession('u_lin', 'demo-pass');
    const zhouSession = await client.createSession('u_zhou', 'demo-pass');
    const lin = new Client({ baseUrl: http.baseUrl, token: (linSession.data as { token: string }).token });
    const zhou = new Client({ baseUrl: http.baseUrl, token: (zhouSession.data as { token: string }).token });
    const a1 = await lin.createAdmission('ch_walk');
    const a2 = await zhou.createAdmission('ch_walk');
    const t1 = (a1.data as { token: string }).token;
    const t2 = (a2.data as { token: string }).token;
    const sa = dgram.createSocket('udp4');
    const sb = dgram.createSocket('udp4');
    sendFrame(sa, '127.0.0.1', match.port, {
      kind: 'join',
      seq: 0,
      channelId: 'ch_walk',
      actorId: 'u_lin',
      payload: Buffer.from(t1),
    });
    sendFrame(sb, '127.0.0.1', match.port, {
      kind: 'join',
      seq: 0,
      channelId: 'ch_walk',
      actorId: 'u_zhou',
      payload: Buffer.from(t2),
    });
    for (let i = 1; i <= 4; i++) {
      sendFrame(sa, '127.0.0.1', match.port, {
        kind: 'input',
        seq: i,
        channelId: 'ch_walk',
        actorId: 'u_lin',
        payload: Buffer.from([1]),
      });
      sendFrame(sb, '127.0.0.1', match.port, {
        kind: 'input',
        seq: i,
        channelId: 'ch_walk',
        actorId: 'u_zhou',
        payload: Buffer.from([3]),
      });
    }
    await waitFor(() => posted);
    const entries = (await client.listEntries('ch_walk')) as { data: { body: { text: string }[] }[] };
    assert.ok(entries.data.some((e) => e.body[0]?.text === '对局已结束'));
    sa.close();
    sb.close();
    await match.close();
    await http.close();
  });
});
