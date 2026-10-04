import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '@open-channel/server';

const dir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8781);
const seed = JSON.parse(fs.readFileSync(path.join(dir, 'seed.json'), 'utf8'));

const dataDir = process.env.DATA_DIR ?? path.join(dir, 'data');
const options = {
  providerId: 'chat',
  providerName: '示例会话',
  capabilities: {
    body: false,
    entries: true,
    entry_threads: true,
    links: true,
    shares: true,
    revisions: false,
  },
  actor: { id: 'u_fuse', display_name: '融合台' },
  token: 'demo-token',
  seed,
  dataDir,
  publicOrigin: 'http://127.0.0.1',
};
const server = createApp(options);

server.listen(port, '127.0.0.1', () => {
  const addr = server.address();
  const p = typeof addr === 'object' && addr ? addr.port : port;
  options.publicOrigin = `http://127.0.0.1:${p}`;
  console.log(`chat provider http://127.0.0.1:${p}`);
});
