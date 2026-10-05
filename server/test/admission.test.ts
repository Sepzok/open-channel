import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LIVE_CAPS, NOTES_CAPS, httpJson, loadSeed, startServer } from './helpers.js';
import { verifyAdmission } from '@open-channel/match';

describe('admissions', () => {
  it('live false is capability_unsupported', async () => {
    const s = await startServer({ providerId: 'notes', capabilities: NOTES_CAPS, seed: loadSeed('notes') });
    const res = await httpJson(s.baseUrl, 'POST', '/v1/channels/ch_draft/admissions', { body: {} });
    assert.equal(res.status, 404);
    assert.equal((res.body as { code: string; capability: string }).code, 'capability_unsupported');
    assert.equal((res.body as { capability: string }).capability, 'live');
    assert.equal((res.body as { data?: unknown }).data, undefined);
    await s.close();
  });

  it('issues a signed ticket for a visible channel', async () => {
    const secret = 'live-secret';
    const s = await startServer({
      providerId: 'walk',
      capabilities: LIVE_CAPS,
      seed: {
        accounts: [{ id: 'u_fuse', display_name: '融合台', provider_role: 'owner', password: 'demo-pass' }],
        channels: [
          {
            id: 'ch_room',
            type: 'room',
            title: '对局房间',
            members: [{ id: 'u_fuse', display_name: '融合台', role: 'owner' }],
          },
        ],
      },
      liveUrl: 'udp://127.0.0.1:9100',
      liveSecret: secret,
    });
    const disco = await httpJson(s.baseUrl, 'GET', '/v1');
    assert.equal((disco.body as { capabilities: { live: boolean } }).capabilities.live, true);
    const res = await httpJson(s.baseUrl, 'POST', '/v1/channels/ch_room/admissions', { body: {} });
    assert.equal(res.status, 201);
    const body = res.body as {
      id: string;
      token: string;
      url: string;
      expires_at: string;
      channel_id: string;
      actor: { id: string };
    };
    assert.match(body.id, /^ad_/);
    assert.equal(body.url, 'udp://127.0.0.1:9100');
    assert.equal(body.channel_id, 'ch_room');
    assert.equal(body.actor.id, 'u_fuse');
    const claims = verifyAdmission(secret, body.token);
    assert.ok(claims);
    assert.equal(claims!.channelId, 'ch_room');
    assert.equal(claims!.actorId, 'u_fuse');
    const extra = await httpJson(s.baseUrl, 'POST', '/v1/channels/ch_room/admissions', {
      body: { expires_at: '2099-01-01T00:00:00.000Z' },
    });
    assert.equal(extra.status, 400);
    await httpJson(s.baseUrl, 'DELETE', '/v1/channels/ch_room');
    const gone = await httpJson(s.baseUrl, 'POST', '/v1/channels/ch_room/admissions', { body: {} });
    assert.equal(gone.status, 409);
    assert.equal((gone.body as { code: string }).code, 'deleted');
    await s.close();
  });
});
