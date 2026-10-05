import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateChannels } from '../src/aggregate.js';
import { CHAT_CAPS, NOTES_CAPS, loadSeed, startServer } from '../../../server/test/helpers.js';

describe('aggregateChannels', () => {
  let chatUrl: string;
  let notesUrl: string;
  let closeChat: () => Promise<void>;
  let closeNotes: () => Promise<void>;

  before(async () => {
    const chat = await startServer({
      providerId: 'chat',
      capabilities: CHAT_CAPS,
      seed: loadSeed('chat'),
    });
    chatUrl = chat.baseUrl;
    closeChat = chat.close;
    const notes = await startServer({
      providerId: 'notes',
      capabilities: NOTES_CAPS,
      seed: loadSeed('notes'),
    });
    notesUrl = notes.baseUrl;
    closeNotes = notes.close;
  });

  after(async () => {
    await closeChat();
    await closeNotes();
  });

  it('marks unavailable provider while keeping others', async () => {
    const result = await aggregateChannels([
      { id: 'chat', name: '示例会话', baseUrl: chatUrl, token: 'demo-token' },
      { id: 'tasks', name: '示例任务', baseUrl: 'http://127.0.0.1:1', token: 'demo-token' },
      { id: 'notes', name: '示例笔记', baseUrl: notesUrl, token: 'demo-token' },
    ]);
    const titles = result.channels.filter((c) => c.providerAvailable).map((c) => c.channel.title);
    assert.ok(titles.includes('发布小组'));
    assert.ok(titles.includes('接口草案'));
    const tasksRow = result.channels.find((c) => c.providerId === 'tasks' && !c.providerAvailable);
    assert.ok(tasksRow);
    assert.match(tasksRow!.channel.title, /不可用/);
  });

  it('sends title contains to providers', async () => {
    const result = await aggregateChannels(
      [
        { id: 'chat', name: '示例会话', baseUrl: chatUrl, token: 'demo-token' },
        { id: 'tasks', name: '示例任务', baseUrl: 'http://127.0.0.1:1', token: 'demo-token' },
        { id: 'notes', name: '示例笔记', baseUrl: notesUrl, token: 'demo-token' },
      ],
      { q: '接口' },
    );
    const titles = result.channels.filter((c) => c.providerAvailable).map((c) => c.channel.title);
    assert.ok(titles.includes('接口草案'));
    assert.equal(titles.includes('发布小组'), false);
    const tasksRow = result.channels.find((c) => c.providerId === 'tasks' && !c.providerAvailable);
    assert.ok(tasksRow);
  });
});
