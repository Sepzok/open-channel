import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const children = [
  ['hub', 'examples/hub/index.ts'],
  ['chat', 'examples/chat/index.ts'],
  ['tasks', 'examples/tasks/index.ts'],
  ['notes', 'examples/notes/index.ts'],
  ['native', 'examples/native/index.ts'],
  ['walk', 'examples/walk/index.ts'],
  ['console', 'examples/console/index.ts'],
].map(([name, entry]) => {
  const child = spawn(process.execPath, [tsx, path.join(root, entry)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) process.exit(code);
  });
  return { name, child };
});

function shutdown() {
  for (const { child } of children) {
    child.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
