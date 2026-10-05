#!/usr/bin/env node
/**
 * Build site/, mirror to gh-pages, then trigger the pages Actions workflow.
 * GitHub Pages publish uses build_type=workflow (deploy-pages). Requires gh + GH_TOKEN.
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

run('npm', ['run', 'pages:build']);
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
run('git', ['-c', 'user.name=Sepzok', '-c', 'user.email=336246806+Sepzok@users.noreply.github.com', 'commit', '-m', 'Deploy Pages demos.'], {
  cwd: td,
  env: gitEnv,
});
const url = `https://x-access-token:${token}@github.com/Sepzok/open-channel.git`;
const push = spawnSync('git', ['-c', 'credential.helper=', 'push', '--force', url, 'HEAD:gh-pages'], {
  cwd: td,
  env: process.env,
  encoding: 'utf8',
});
if (push.stderr) process.stderr.write(String(push.stderr).replaceAll(token, '[redacted]'));
if (push.status !== 0) process.exit(push.status || 1);
fs.rmSync(td, { recursive: true, force: true });
console.log('Pushed gh-pages mirror. Pages publish uses Actions (workflow).');

const dispatch = spawnSync(
  'gh',
  ['workflow', 'run', 'pages.yml', '--repo', 'Sepzok/open-channel'],
  { env: { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token }, encoding: 'utf8' },
);
if (dispatch.status !== 0) {
  process.stderr.write(String(dispatch.stderr || dispatch.stdout || 'workflow dispatch failed\n'));
  process.exit(dispatch.status || 1);
}
console.log('Triggered pages workflow. URL: https://sepzok.github.io/open-channel/');
