import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client, channelResourceUrl, parseChannelResourceUrl, matchProvider } from '../sdk/typescript/src/index.js';
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
});
