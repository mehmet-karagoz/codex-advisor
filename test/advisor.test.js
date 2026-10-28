import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { run } from '../src/advisor.js';

const cli = fileURLToPath(new URL('../bin/advisor.js', import.meta.url));
const SKILL = '.agents/skills/model-advisor/SKILL.md';
const MANIFEST = '.advisor/manifest.json';

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'advisor-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function put(root, name, content) {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), content);
}
const get = (root, name) => fs.readFileSync(path.join(root, name), 'utf8');
function invoke(root, command, ...options) {
  let result;
  const target = options.includes('--path') ? [] : ['--path', root];
  const code = run([command, '--json', ...target, ...options], root, (text) => { result = JSON.parse(text); });
  return { code, ...result };
}

test('installs skills, agents and project context; repeat init and update are idempotent', (t) => {
  const root = project(t);
  put(root, 'package.json', JSON.stringify({ dependencies: { next: '1', react: '1' }, scripts: { test: 'vitest' } }));
  put(root, 'pnpm-lock.yaml', '');
  const result = invoke(root, 'init');
  assert.equal(result.code, 0);
  assert.ok(get(root, SKILL).startsWith('---\n'));
  assert.ok(get(root, '.codex/agents/fast-worker.toml').includes('name = "fast_worker"'));
  const context = JSON.parse(get(root, '.advisor/context.json'));
  assert.deepEqual(context.frameworks, ['Next.js', 'React']);
  assert.deepEqual(context.lockfiles, ['pnpm-lock.yaml']);
  assert.equal(context.scripts.test, 'vitest');
  assert.equal(invoke(root, 'status').healthy, true);
  assert.deepEqual(invoke(root, 'init').changes, []);
  assert.deepEqual(invoke(root, 'update').changes, []);
});

test('dry-run does not create any files or directories', (t) => {
  const root = project(t);
  const result = invoke(root, 'init', '--dry-run');
  assert.equal(result.code, 0);
  assert.ok(result.changes.length > 0);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('preserves AGENTS bytes and unrelated edits across update and remove', (t) => {
  const root = project(t);
  const original = '# Team\r\n\r\nUse our conventions.\r\n';
  put(root, 'AGENTS.md', original);
  invoke(root, 'init');
  const installed = get(root, 'AGENTS.md');
  put(root, 'AGENTS.md', 'New note\n' + installed + '\nAnother note\n');
  invoke(root, 'update');
  assert.equal(invoke(root, 'remove').code, 0);
  assert.equal(get(root, 'AGENTS.md'), 'New note\n' + original + '\nAnother note\n');
  assert.equal(fs.existsSync(path.join(root, SKILL)), false);
  assert.equal(fs.existsSync(path.join(root, '.advisor')), false);
});

test('preserves a preexisting empty AGENTS.md', (t) => {
  const root = project(t);
  put(root, 'AGENTS.md', '');
  invoke(root, 'init');
  invoke(root, 'remove');
  assert.equal(get(root, 'AGENTS.md'), '');
});

test('removes newly created AGENTS.md and leaves unrelated files', (t) => {
  const root = project(t);
  invoke(root, 'init');
  put(root, '.agents/skills/custom/SKILL.md', 'mine');
  put(root, '.codex/config.toml', 'model = "custom"');
  invoke(root, 'remove');
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);
  assert.equal(get(root, '.agents/skills/custom/SKILL.md'), 'mine');
  assert.equal(get(root, '.codex/config.toml'), 'model = "custom"');
  assert.equal(invoke(root, 'remove').code, 0);
});

test('existing different skill aborts the whole installation', (t) => {
  const root = project(t);
  put(root, SKILL, 'user skill');
  const result = invoke(root, 'init');
  assert.equal(result.code, 1);
  assert.equal(result.conflicts.length, 1);
  assert.equal(get(root, SKILL), 'user skill');
  assert.equal(fs.existsSync(path.join(root, MANIFEST)), false);
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);
});

test('identical preexisting files are borrowed and never removed', (t) => {
  const source = project(t);
  invoke(source, 'init');
  const root = project(t);
  put(root, SKILL, get(source, SKILL));
  invoke(root, 'init');
  assert.equal(JSON.parse(get(root, MANIFEST)).files[SKILL].owned, false);
  put(root, SKILL, 'my later edit');
  assert.equal(invoke(root, 'remove').code, 0);
  assert.equal(get(root, SKILL), 'my later edit');
});

test('modified owned file blocks update and remove without partial writes', (t) => {
  const root = project(t);
  invoke(root, 'init');
  const manifest = get(root, MANIFEST);
  put(root, SKILL, 'edited');
  for (const command of ['init', 'update', 'remove']) {
    assert.equal(invoke(root, command).code, 1);
    assert.equal(get(root, SKILL), 'edited');
    assert.equal(get(root, MANIFEST), manifest);
    assert.equal(fs.existsSync(path.join(root, '.codex/agents/fast-worker.toml')), true);
  }
  assert.equal(invoke(root, 'status').files.find((item) => item.path === SKILL).state, 'modified');
});

test('modified advisor instructions block update and remove', (t) => {
  const root = project(t);
  invoke(root, 'init');
  put(root, 'AGENTS.md', get(root, 'AGENTS.md').replace('## Advisor', '## Custom Advisor'));
  assert.equal(invoke(root, 'update').code, 1);
  assert.equal(invoke(root, 'remove').code, 1);
  assert.ok(get(root, SKILL));
});

test('update restores missing managed files and section', (t) => {
  const root = project(t);
  invoke(root, 'init');
  fs.unlinkSync(path.join(root, SKILL));
  fs.unlinkSync(path.join(root, 'AGENTS.md'));
  assert.equal(invoke(root, 'status').healthy, false);
  assert.equal(invoke(root, 'update').code, 0);
  assert.equal(invoke(root, 'status').healthy, true);
});

test('update refreshes detected context and identifies an outdated bundle', (t) => {
  const root = project(t);
  invoke(root, 'init');
  put(root, 'go.mod', 'module example');
  const skill = get(root, SKILL) + '\nOld release content\n';
  put(root, SKILL, skill);
  const manifest = JSON.parse(get(root, MANIFEST));
  // A prior valid release owns its original checksum; update may replace it.
  manifest.files[SKILL].sha256 = createHash('sha256').update(skill).digest('hex');
  put(root, MANIFEST, JSON.stringify(manifest));
  const before = invoke(root, 'status');
  assert.equal(before.files.find((item) => item.path === SKILL).state, 'outdated');
  assert.equal(invoke(root, 'update').code, 0);
  assert.deepEqual(JSON.parse(get(root, '.advisor/context.json')).technologies, ['Go']);
  assert.equal(invoke(root, 'status').healthy, true);
});

test('finds Git root from nested directories and supports explicit target', (t) => {
  const root = project(t);
  put(root, '.git', 'gitdir: /some/worktree');
  fs.mkdirSync(path.join(root, 'nested'));
  let result;
  run(['init', '--json'], path.join(root, 'nested'), (text) => { result = JSON.parse(text); });
  assert.equal(result.root, root);
  assert.equal(invoke(root, 'init', '--path', 'nested').root, path.join(root, 'nested'));
});

test('rejects symlinked managed directory before writing', (t) => {
  const root = project(t);
  const outside = project(t);
  fs.symlinkSync(outside, path.join(root, '.agents'));
  assert.throws(() => invoke(root, 'init'), /Sembolik bağlantı/);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(fs.existsSync(path.join(root, '.advisor')), false);
});

test('rejects a manifest containing an arbitrary deletion path', (t) => {
  const root = project(t);
  invoke(root, 'init');
  const manifest = JSON.parse(get(root, MANIFEST));
  manifest.files['../../victim'] = manifest.files[SKILL];
  put(root, MANIFEST, JSON.stringify(manifest));
  assert.throws(() => invoke(root, 'remove'), /manifest/);
  assert.ok(get(root, SKILL));
});

test('rejects malformed or unmanaged advisor blocks without writes', (t) => {
  const root = project(t);
  put(root, 'AGENTS.md', '<!-- codex-advisor:start -->\nbroken');
  assert.throws(() => invoke(root, 'init'), /işaretleri/);
  assert.equal(fs.existsSync(path.join(root, SKILL)), false);
  put(root, 'AGENTS.md', '<!-- codex-advisor:start --><!-- codex-advisor:end -->');
  assert.equal(invoke(root, 'init').code, 1);
  assert.equal(fs.existsSync(path.join(root, SKILL)), false);
});

test('lock prevents concurrent mutation and is not removed by another invocation', (t) => {
  const root = project(t);
  put(root, '.advisor/lock', 'busy');
  assert.throws(() => invoke(root, 'init'), /Başka bir advisor/);
  assert.equal(get(root, '.advisor/lock'), 'busy');
  assert.equal(fs.existsSync(path.join(root, SKILL)), false);
});

test('CLI reports missing installation, argument errors and help with correct exit codes', (t) => {
  const root = project(t);
  for (const [args, expected] of [[['status', '--json'], 1], [['--help'], 0], [['--version'], 0],
    [['update'], 1], [['init', '--path'], 1], [['init', '--wat'], 1]]) {
    const target = args[0] === 'status' || args[0] === 'update' ? ['--path', root] : [];
    const result = spawnSync(process.execPath, [cli, ...args, ...target], { cwd: root, encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, expected, result.stderr);
    if (args.includes('--json')) assert.equal(JSON.parse(result.stdout).installed, false);
  }
});

test('invalid package.json remains untouched and detection returns a warning', (t) => {
  const root = project(t);
  put(root, 'package.json', '{ broken');
  const result = invoke(root, 'init');
  assert.equal(result.code, 0);
  assert.equal(result.context.warnings.length, 1);
  assert.equal(get(root, 'package.json'), '{ broken');
});

test('CLI completes preview, install, status, update and remove in a project with spaces', (t) => {
  const parent = project(t);
  const root = path.join(parent, 'my project');
  fs.mkdirSync(root);
  for (const args of [['init', '--dry-run'], ['init'], ['status'], ['update'], ['remove']]) {
    const result = spawnSync(process.execPath, [cli, ...args, '--path', root, '--json'], { encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).root, root);
    if (args.includes('--dry-run')) assert.deepEqual(fs.readdirSync(root), []);
  }
  assert.equal(fs.existsSync(path.join(root, MANIFEST)), false);
  assert.equal(fs.existsSync(path.join(root, SKILL)), false);
});
