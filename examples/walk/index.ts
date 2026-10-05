import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, bindHost, originAfterListen } from '@open-channel/server';
import { createMatchHost } from '@open-channel/match';
import { encodeWalk, initialWalk, reduceWalk, walkShouldEnd } from './game.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8785);
const seed = JSON.parse(fs.readFileSync(path.join(dir, 'seed.json'), 'utf8'));
const dataDir = process.env.DATA_DIR ?? path.join(dir, 'data');
const host = bindHost();
const secret = process.env.LIVE_SECRET ?? 'walk-live-secret';

const optionsHolder: { publicOrigin: string } = { publicOrigin: 'http://127.0.0.1' };

const match = await createMatchHost({
  secret,
  port: Number(process.env.MATCH_PORT ?? 0),
  tickMs: 50,
  initialState: initialWalk(),
  reduce: reduceWalk,
  encode: encodeWalk,
  shouldEnd: walkShouldEnd,
  onEnd: (channelId) => {
    const origin = optionsHolder.publicOrigin;
    void fetch(`${origin}/v1/channels/${channelId}/entries`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer demo-token',
        'Content-Type': 'application/json',
        Accept: 'application/vnd.ocp+json',
      },
      body: JSON.stringify({
        type: 'message',
        body: [{ type: 'text', text: '对局已结束', format: 'plain' }],
        parent_id: null,
        anchor: null,
      }),
    });
  },
});

const options = {
  providerId: 'walk',
  providerName: '对局房间',
  capabilities: {
    body: false,
    entries: true,
    entry_threads: false,
    links: true,
    shares: false,
    revisions: false,
    live: true,
  },
  actor: { id: 'u_fuse', display_name: '融合台' },
  token: 'demo-token',
  seed,
  dataDir,
  publicOrigin: optionsHolder.publicOrigin,
  liveUrl: match.address,
  liveSecret: secret,
};
const server = createApp(options);

server.listen(port, host, () => {
  const addr = server.address();
  const p = typeof addr === 'object' && addr ? addr.port : port;
  options.publicOrigin = originAfterListen(host, p);
  optionsHolder.publicOrigin = options.publicOrigin;
  console.log(`walk provider ${options.publicOrigin}`);
  console.log(`walk match ${match.address}`);
});
