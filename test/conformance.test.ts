import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client, OcpError, channelResourceUrl, parseChannelResourceUrl, matchProvider } from '../sdk/typescript/src/index.js';
import { NOTES_CAPS, TASKS_CAPS, loadSeed, startServer } from '../server/test/helpers.js';
import { assertDiscoveryAndLinks } from './conformance.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function startNative(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', path.join(root, 'examples/native/index.ts')], {
      cwd: root,
      env: { ...process.env, PORT: '0' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let buf = '';
    const timer = setTimeout(() => reject(new Error('native timeout')), 30000);
    child.stdout?.on('data', (d: Buffer) => {
      buf += d.toString();
      const m = buf.match(/http:\/\/[^\s]+/);
      if (m) {
        clearTimeout(timer);
        resolve({
          baseUrl: m[0],
          close: () =>
            new Promise((resClose) => {
              child.on('exit', () => resClose());
              child.kill('SIGTERM');
            }),
        });
      }
    });
    child.on('error', reject);
  });
}

describe('resource URL helpers', () => {
  it('parses channel resource URLs only', () => {
    assert.equal(parseChannelResourceUrl('https://example.com/spec'), null);
    assert.equal(parseChannelResourceUrl('http://127.0.0.1:9/v1/channels/ch_proj?x=1'), null);
    const hit = parseChannelResourceUrl('http://127.0.0.1:9/v1/channels/ch_proj');
    assert.deepEqual(hit, { origin: 'http://127.0.0.1:9', channelId: 'ch_proj' });
    assert.equal(channelResourceUrl('http://127.0.0.1:9/', 'ch_proj'), 'http://127.0.0.1:9/v1/channels/ch_proj');
    assert.equal(
      matchProvider([{ id: 'tasks', baseUrl: 'http://127.0.0.1:9' }], 'http://127.0.0.1:9/v1/channels/ch_proj')?.providerId,
      'tasks',
    );
    assert.equal(matchProvider([{ id: 'tasks', baseUrl: 'http://127.0.0.1:9' }], 'https://example.com/spec'), null);
  });
});

describe('notes and native black-box', () => {
  let notesUrl: string;
  let tasksUrl: string;
  let nativeUrl: string;
  let closeNotes: () => Promise<void>;
  let closeTasks: () => Promise<void>;
  let closeNative: () => Promise<void>;

  before(async () => {
    const notes = await startServer({
      providerId: 'notes',
      capabilities: NOTES_CAPS,
      seed: loadSeed('notes'),
    });
    notesUrl = notes.baseUrl;
    closeNotes = notes.close;
    const tasks = await startServer({
      providerId: 'tasks',
      capabilities: TASKS_CAPS,
      seed: loadSeed('tasks'),
    });
    tasksUrl = tasks.baseUrl;
    closeTasks = tasks.close;
    const native = await startNative();
    nativeUrl = native.baseUrl;
    closeNative = native.close;
  });

  after(async () => {
    await closeNotes();
    await closeTasks();
    await closeNative();
  });

  it('does not import the reference server', () => {
    const src = fs.readFileSync(path.join(root, 'examples/native/index.ts'), 'utf8');
    assert.equal(src.includes('createApp'), false);
    assert.equal(src.includes('@open-channel/server'), false);
  });

  it('notes stores cross-provider target_url', async () => {
    const other = channelResourceUrl(tasksUrl, 'ch_proj');
    await assertDiscoveryAndLinks(notesUrl, 'demo-token', { channelId: 'ch_draft', otherChannelUrl: other });
    const client = new Client({ baseUrl: notesUrl, token: 'demo-token' });
    const disco = (await client.getDiscovery()) as { capabilities: { links: boolean } };
    assert.equal(disco.capabilities.links, true);
  });

  it('native exposes native_id and the same link shape', async () => {
    const other = channelResourceUrl(notesUrl, 'ch_draft');
    await assertDiscoveryAndLinks(nativeUrl, 'demo-token', {
      channelId: 'ch_accept',
      nativeId: 'T-100',
      otherChannelUrl: other,
    });
  });

  it('native rejects undeclared capabilities instead of empty lists', async () => {
    const client = new Client({ baseUrl: nativeUrl, token: 'demo-token' });
    const disco = (await client.getDiscovery({ anonymous: true })) as {
      capabilities: { body: boolean; entry_threads: boolean; shares: boolean; revisions: boolean };
    };
    assert.equal(disco.capabilities.body, false);
    assert.equal(disco.capabilities.entry_threads, false);
    assert.equal(disco.capabilities.shares, false);
    assert.equal(disco.capabilities.revisions, false);

    async function expectCode(fn: () => Promise<unknown>, code: string, capability?: string) {
      try {
        await fn();
        assert.fail(`expected ${code}`);
      } catch (e) {
        assert.ok(e instanceof OcpError);
        assert.equal(e.code, code);
        if (capability) assert.equal(e.body.capability, capability);
        assert.equal((e.body as { data?: unknown }).data, undefined);
      }
    }

    await expectCode(() => client.listRevisions('ch_accept'), 'capability_unsupported', 'revisions');
    await expectCode(() => client.getRevision('ch_accept', 'rev_x'), 'capability_unsupported', 'revisions');
    await expectCode(() => client.restoreRevision('ch_accept', 'rev_x'), 'capability_unsupported', 'revisions');
    await expectCode(
      () => client.updateChannel('ch_accept', { body: [{ type: 'text', text: 'x', format: 'plain' }] }),
      'capability_unsupported',
      'body',
    );
    await expectCode(
      () =>
        client.createEntry('ch_accept', {
          type: 'comment',
          parent_id: 'en_accept_1',
          body: [{ type: 'text', text: '子条', format: 'plain' }],
        }),
      'threads_unsupported',
    );
    await expectCode(
      () =>
        client.createEntry('ch_accept', {
          type: 'comment',
          anchor: { block_id: 'blk_x' },
          body: [{ type: 'text', text: '锚', format: 'plain' }],
        }),
      'anchor_unsupported',
    );
    await expectCode(() => client.listChannels({ filter: 'title co "验收"' }), 'validation_error');
    await expectCode(() => client.listEntries('ch_accept', { parent_id: 'en_accept_1' }), 'threads_unsupported');

    const share = await fetch(`${nativeUrl}/s/nope`);
    const shareBody = (await share.json()) as { code: string; data?: unknown };
    assert.equal(share.status, 404);
    assert.equal(shareBody.code, 'share_unavailable');
    assert.equal(shareBody.data, undefined);
  });
});
