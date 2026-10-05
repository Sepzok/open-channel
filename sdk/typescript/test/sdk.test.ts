import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, OcpError } from '../src/index.js';
import { NOTES_CAPS, loadSeed, startServer } from '../../../server/test/helpers.js';

describe('TypeScript SDK', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let client: Client;

  before(async () => {
    const s = await startServer({
      providerId: 'notes',
      capabilities: NOTES_CAPS,
      seed: loadSeed('notes'),
    });
    baseUrl = s.baseUrl;
    close = s.close;
    client = new Client({ baseUrl, token: 'demo-token' });
  });

  after(async () => {
    await close();
  });

  it('list update entry validation', async () => {
    const list = (await client.listChannels()) as { data: { id: string }[] };
    assert.ok(list.data.length > 0);
    const ch = (await client.getChannel('ch_glossary')) as { revision: string; body: { text: string }[] };
    const oldRev = ch.revision;
    const updated = (await client.updateChannel('ch_glossary', {
      base_revision: oldRev,
      body: [{ type: 'text', text: 'SDK 更新正文', format: 'plain' }],
    })) as { revision: string };
    assert.notEqual(updated.revision, oldRev);
    const old = await client.getRevision('ch_glossary', oldRev);
    assert.notEqual((old as { body: { text: string }[] }).body[0]?.text, 'SDK 更新正文');

    const before = (await client.listEntries('ch_glossary')) as { data: unknown[] };
    const countBefore = before.data.length;
    await client.createEntry('ch_glossary', {
      type: 'comment',
      body: [{ type: 'text', text: 'SDK 讨论', format: 'plain' }],
      parent_id: null,
      anchor: null,
    });
    const entry = (await client.listEntries('ch_glossary')) as { data: { author: { id: string } }[] };
    assert.equal(entry.data.length, countBefore + 1);
    assert.equal(entry.data.at(-1)!.author.id, 'u_fuse');

    try {
      await client.createEntry('ch_glossary', {
        type: 'comment',
        author: { id: 'x', display_name: 'x' },
        body: [{ type: 'text', text: 'bad', format: 'plain' }],
      });
      assert.fail('expected error');
    } catch (e) {
      assert.ok(e instanceof OcpError);
      assert.equal(e.code, 'validation_error');
    }
    const after = (await client.listEntries('ch_glossary')) as { data: unknown[] };
    assert.equal(after.data.length, countBefore + 1);

    const refs = (await client.listLinks('ch_draft', { type: 'references' })) as { data: { target_id: string }[] };
    assert.equal(refs.data[0]?.target_id, 'ch_glossary');

    const created = await client.createChannel({
      type: 'note',
      title: '检索样例',
      body: [],
      members: [],
      ext: { artist: '林可', duration_ms: 200000 },
    });
    const id = (created.data as { id: string }).id;
    const filtered = (await client.listChannels({
      filter: 'ext.artist eq "林可" and ext.duration_ms gt 180000',
    })) as { data: { id: string }[] };
    assert.ok(filtered.data.some((c) => c.id === id));
    const miss = (await client.listChannels({ filter: 'ext.artist eq "别人"' })) as { data: { id: string }[] };
    assert.equal(
      miss.data.some((c) => c.id === id),
      false,
    );
    const anns = (await client.listEntries('ch_draft', { filter: 'type eq "annotation"' })) as { data: { type: string }[] };
    assert.ok(anns.data.length > 0);
    assert.ok(anns.data.every((e) => e.type === 'annotation'));
    const links = (await client.listLinks('ch_draft', { filter: 'title co "术语"' })) as { data: { title?: string }[] };
    assert.equal(links.data.length, 1);
    assert.equal(links.data[0]?.title, '术语表');

    const session = await client.createSession('u_lin', 'demo-pass');
    const lin = new Client({ baseUrl, token: (session.data as { token: string }).token });
    const asLin = (await lin.listChannels()) as { data: { title: string }[] };
    assert.ok(asLin.data.some((c) => c.title === '接口草案'));

    const disco = (await client.getDiscovery({ anonymous: true })) as { protocol: string; actor: { id: string } };
    assert.equal(disco.protocol, 'ocp');
    assert.equal(disco.actor.id, 'u_fuse');
    const accounts = (await client.listAccounts()) as { data: { id: string }[] };
    assert.ok(accounts.data.some((a) => a.id === 'u_lin'));
  });
});
