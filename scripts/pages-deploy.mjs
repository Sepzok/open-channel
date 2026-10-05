#!/usr/bin/env node
/**
 * Build site/, force-push gh-pages on open-channel (and Sepzok/ocp mirror).
 * Optionally dispatch pages.yml when Pages is set to workflow publish.
 * Requires GH_TOKEN / GITHUB_TOKEN (Sepzok).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  console.error('Set GH_TOKEN or GITHUB_TOKEN (Sepzok) before pages:deploy');
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: opts.cwd || repo, stdio: 'inherit', env: opts.env || process.env });
  if (r.status !== 0) process.exit(r.status || 1);
}

function pushBranch(remoteUrl, message) {
  const site = path.join(repo, 'site');
  const td = fs.mkdtempSync(path.join(os.tmpdir(), 'ocp-ghpages-'));
  fs.cpSync(site, td, { recursive: true });
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Sepzok',
    GIT_AUTHOR_EMAIL: '336246806+Sepzok@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'Sepzok',
    GIT_COMMITTER_EMAIL: '336246806+Sepzok@users.noreply.github.com',
  };
  run('git', ['init'], { cwd: td });
  run('git', ['checkout', '-b', 'gh-pages'], { cwd: td });
  run('git', ['add', '-A'], { cwd: td });
  run(
    'git',
    ['-c', 'user.name=Sepzok', '-c', 'user.email=336246806+Sepzok@users.noreply.github.com', 'commit', '-m', message],
    { cwd: td, env: gitEnv },
  );
  const push = spawnSync('git', ['-c', 'credential.helper=', 'push', '--force', remoteUrl, 'HEAD:gh-pages'], {
    cwd: td,
    env: process.env,
    encoding: 'utf8',
  });
  if (push.stderr) process.stderr.write(String(push.stderr).replaceAll(token, '[redacted]'));
  fs.rmSync(td, { recursive: true, force: true });
  if (push.status !== 0) process.exit(push.status || 1);
}

run('npm', ['run', 'pages:build']);
pushBranch(`https://x-access-token:${token}@github.com/Sepzok/open-channel.git`, 'Deploy Pages demos.');
pushBranch(`https://x-access-token:${token}@github.com/Sepzok/ocp.git`, 'Publish Open Channel in-browser demos.');

const dispatch = spawnSync(
  'gh',
  ['workflow', 'run', 'pages.yml', '--repo', 'Sepzok/open-channel'],
  { env: { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token }, encoding: 'utf8' },
);
if (dispatch.status !== 0) {
  process.stderr.write(
    'pages workflow dispatch skipped/failed (ok if Pages source is legacy gh-pages):\n' +
      String(dispatch.stderr || dispatch.stdout || '') +
      '\n',
  );
}

console.log('Pushed gh-pages → Sepzok/open-channel and Sepzok/ocp.');
console.log('Pages (when builds finish): https://sepzok.github.io/open-channel/');
console.log('Mirror: https://sepzok.github.io/ocp/');
console.log('CDN now: https://cdn.jsdelivr.net/gh/Sepzok/open-channel@gh-pages/index.html');
