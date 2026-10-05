import assert from 'node:assert/strict';
import { Client, OcpError, parseChannelResourceUrl } from '../sdk/typescript/src/index.js';

export async function assertDiscoveryAndLinks(
  baseUrl: string,
  token: string,
  opts: { channelId: string; nativeId?: string; otherChannelUrl: string },
): Promise<void> {
  const client = new Client({ baseUrl, token });
  const disco = (await client.getDiscovery({ anonymous: true })) as {
    protocol: string;
    version: string;
    capabilities: { links: boolean; entries: boolean };
    provider: { id: string };
  };
  assert.equal(disco.protocol, 'ocp');
  assert.equal(disco.version, '1');
  assert.equal(typeof disco.capabilities.links, 'boolean');

  const ch = (await client.getChannel(opts.channelId)) as { id: string; ext?: { native_id?: string } };
  assert.equal(ch.id, opts.channelId);
  if (opts.nativeId) {
    assert.equal(ch.ext?.native_id, opts.nativeId);
  }

  if (disco.capabilities.links) {
    try {
      await client.createLink(opts.channelId, { type: 'references', target_url: 'ftp://x', title: '坏' });
      assert.fail('expected ftp rejected');
    } catch (e) {
      assert.ok(e instanceof OcpError);
      assert.equal(e.code, 'validation_error');
    }
    const created = await client.createLink(opts.channelId, {
      type: 'references',
      target_url: opts.otherChannelUrl,
      title: '跨提供方',
    });
    const link = created.data as { target_url?: string; target_id?: string };
    assert.equal(link.target_url, opts.otherChannelUrl);
    assert.equal(link.target_id, undefined);
    const listed = (await client.listLinks(opts.channelId)) as {
      data: { target_url?: string; title?: string }[];
    };
    const hit = listed.data.find((l) => l.target_url === opts.otherChannelUrl);
    assert.ok(hit);
    const parsed = parseChannelResourceUrl(hit!.target_url!);
    assert.ok(parsed);
    assert.equal(parsed!.channelId, parseChannelResourceUrl(opts.otherChannelUrl)?.channelId);
  }

  if (disco.capabilities.entries) {
    const before = (await client.listEntries(opts.channelId)) as { data: unknown[] };
    const n = before.data.length;
    try {
      await client.createEntry(opts.channelId, {
        type: 'comment',
        author: { id: 'x', display_name: 'x' },
        body: [{ type: 'text', text: 'bad', format: 'plain' }],
      });
      assert.fail('expected author rejected');
    } catch (e) {
      assert.ok(e instanceof OcpError);
      assert.equal(e.code, 'validation_error');
    }
    const after = (await client.listEntries(opts.channelId)) as { data: unknown[] };
    assert.equal(after.data.length, n);
  }
}
