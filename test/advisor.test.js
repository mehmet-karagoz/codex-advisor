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
  const host = command === 'init' && !options.includes('--target') ? ['--target', 'all'] : [];
  const code = run([command, '--json', ...target, ...host, ...options], root, (text) => { result = JSON.parse(text); });
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

const HOST_INSTRUCTIONS = ['CLAUDE.md', '.github/copilot-instructions.md'];

test('Copilot installs a persistent coordinator with automatic routing and a direct-work fallback', (t) => {
  const root = project(t);
  let output;
  assert.equal(run(['init', '--target', 'copilot', '--path', root], root,
    (text) => { output = text; }), 0);
  assert.match(output, /başlangıçta advisor ajanını bir kez seçin/);
  const agent = get(root, '.github/agents/advisor.agent.md');
  const header = agent.split('---')[1];
  // Omitted tools keep each editor's native tools available, including edits and delegation.
  assert.doesNotMatch(header, /^(tools|agents|handoffs):/m);
  assert.match(agent, /automatically invoke the appropriate configured worker/);
  for (const role of ['fast-worker', 'standard-worker', 'deep-expert']) {
    assert.ok(agent.includes(`- ${role} (`));
    const workerHeader = get(root, `.github/agents/${role}.agent.md`).split('---')[1];
    assert.doesNotMatch(workerHeader, /^disable-model-invocation: true$/m);
  }
  assert.match(agent, /without per-call model overrides/);
  assert.match(agent, /complete the authorized work yourself/);
  assert.match(agent, /You may edit files and run project commands/);
  assert.doesNotMatch(agent, /This role is advisory: do not edit/);
  assert.match(agent, /A request only for advice, review or a plan must remain within that scope/);
  assert.match(get(root, '.github/copilot-instructions.md'), /Do not ask the user to choose an agent or model for every task/);
  assert.match(get(root, '.github/skills/model-advisor/SKILL.md'), /Select advisor once/);
  assert.match(get(root, '.github/agents/standard-worker.agent.md'), /instead of invoking advisor recursively/);
  assert.equal(invoke(root, 'status').healthy, true);
});

test('Copilot update replaces a managed advisory-only agent and stays idempotent', (t) => {
  const root = project(t);
  invoke(root, 'init', '--target', 'all');
  const name = '.github/agents/advisor.agent.md';
  const old = '---\nname: advisor\nmodel: Claude Opus 5.5\n---\nThis role is advisory: do not edit files.\n';
  put(root, name, old);
  const manifest = JSON.parse(get(root, MANIFEST));
  manifest.files[name].sha256 = createHash('sha256').update(old).digest('hex');
  put(root, MANIFEST, JSON.stringify(manifest));
  const claude = get(root, '.claude/agents/advisor.md');
  const codex = get(root, '.codex/agents/standard-worker.toml');
  const preview = invoke(root, 'update', '--target', 'copilot', '--dry-run');
  assert.equal(preview.code, 0);
  assert.ok(preview.changes.some((item) => item.path === name && item.action === 'update'));
  assert.equal(get(root, name), old);
  assert.equal(invoke(root, 'update', '--target', 'copilot').code, 0);
  assert.match(get(root, name), /persistent coordinator/);
  assert.equal(get(root, '.claude/agents/advisor.md'), claude);
  assert.equal(get(root, '.codex/agents/standard-worker.toml'), codex);
  assert.equal(invoke(root, 'status').healthy, true);
  assert.deepEqual(invoke(root, 'update', '--target', 'copilot').changes, []);
});

test('installs native model profiles and a shared skill for all three hosts', (t) => {
  const root = project(t);
  invoke(root, 'init');
  for (const [role, label, id] of [
    ['advisor', 'Claude Opus 5.5', 'claude-opus-5-5'],
    ['fast-worker', 'Claude Haiku 5.5', 'claude-haiku-5-5'],
    ['standard-worker', 'Claude Sonnet 5.5', 'claude-sonnet-5-5'],
    ['deep-expert', 'Claude Opus 5.5', 'claude-opus-5-5'],
  ]) {
    assert.ok(get(root, `.github/agents/${role}.agent.md`).includes(`model: ${label}\n`));
    assert.ok(get(root, `.claude/agents/${role}.md`).includes(`model: ${id}\n`));
  }
  assert.equal(get(root, '.github/skills/model-advisor/SKILL.md'), get(root, SKILL));
  assert.equal(get(root, '.claude/skills/model-advisor/SKILL.md'), get(root, SKILL));
  assert.ok(get(root, '.codex/agents/standard-worker.toml').includes('model = "gpt-6-sol"'));
  for (const name of HOST_INSTRUCTIONS) assert.ok(get(root, name).includes('## Advisor'));
  assert.equal(JSON.parse(get(root, MANIFEST)).schemaVersion, 3);
});

for (const name of HOST_INSTRUCTIONS) {
  test(`preserves existing ${name} bytes and outside edits through the lifecycle`, (t) => {
    const root = project(t);
    const original = '# Team\r\nProject rules.\r\n';
    put(root, name, original);
    invoke(root, 'init');
    put(root, name, 'Before\n' + get(root, name) + '\nAfter\n');
    assert.equal(invoke(root, 'update').code, 0);
    assert.equal(invoke(root, 'remove').code, 0);
    assert.equal(get(root, name), 'Before\n' + original + '\nAfter\n');
  });

  test(`modified managed section in ${name} blocks all writes`, (t) => {
    const root = project(t);
    invoke(root, 'init');
    const manifest = get(root, MANIFEST);
    put(root, name, get(root, name).replace('## Advisor', '## Custom'));
    for (const command of ['init', 'update', 'remove']) {
      assert.equal(invoke(root, command).code, 1);
      assert.equal(get(root, MANIFEST), manifest);
      assert.ok(get(root, '.claude/agents/advisor.md'));
    }
    assert.equal(invoke(root, 'status').files.find((item) => item.path === `${name} (advisor)`).state, 'modified');
  });

  test(`rejects symlinked ${name} without partial installation`, (t) => {
    const root = project(t);
    const outside = project(t);
    put(outside, 'instructions', 'private rules');
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.symlinkSync(path.join(outside, 'instructions'), path.join(root, name));
    assert.throws(() => invoke(root, 'init'), /Sembolik bağlantı/);
    assert.equal(get(outside, 'instructions'), 'private rules');
    assert.equal(fs.existsSync(path.join(root, SKILL)), false);
  });
}

function legacyInstall(root) {
  const names = [SKILL, '.codex/agents/fast-worker.toml', '.codex/agents/standard-worker.toml',
    '.codex/agents/deep-expert.toml', '.advisor/context.json'];
  const files = {};
  for (const name of names) {
    const text = `Original v0.1 content: ${name}\n`;
    put(root, name, text);
    files[name] = { owned: true, sha256: createHash('sha256').update(text).digest('hex') };
  }
  const block = '<!-- codex-advisor:start -->\n## Advisor\nOld instructions\n<!-- codex-advisor:end -->';
  put(root, 'AGENTS.md', '# Existing rules\n\n' + block);
  put(root, MANIFEST, JSON.stringify({ schemaVersion: 1, version: '0.1.0', profile: 'base', files,
    agents: { sha256: createHash('sha256').update(block).digest('hex'), existed: true, separator: '\n' } }));
}

test('migrates v0.1 installations without losing ownership or existing host instructions', (t) => {
  const root = project(t);
  legacyInstall(root);
  put(root, 'CLAUDE.md', 'Team Claude rules');
  put(root, '.github/copilot-instructions.md', 'Team Copilot rules\r\n');
  const oldManifest = get(root, MANIFEST);
  assert.equal(invoke(root, 'status').healthy, false);
  assert.equal(invoke(root, 'update', '--dry-run').code, 0);
  assert.equal(get(root, MANIFEST), oldManifest);
  assert.equal(invoke(root, 'update').code, 0);
  assert.equal(invoke(root, 'status').healthy, true);
  assert.deepEqual(invoke(root, 'update').changes, []);
  assert.equal(invoke(root, 'remove').code, 0);
  assert.equal(get(root, 'AGENTS.md'), '# Existing rules\n');
  assert.equal(get(root, 'CLAUDE.md'), 'Team Claude rules');
  assert.equal(get(root, '.github/copilot-instructions.md'), 'Team Copilot rules\r\n');
});

test('can remove v0.1 installation without adopting unrelated host files', (t) => {
  const root = project(t);
  legacyInstall(root);
  put(root, 'CLAUDE.md', 'Mine');
  put(root, '.github/agents/advisor.agent.md', 'Mine too');
  assert.equal(invoke(root, 'remove').code, 0);
  assert.equal(get(root, 'CLAUDE.md'), 'Mine');
  assert.equal(get(root, '.github/agents/advisor.agent.md'), 'Mine too');
});

test('native agent collision aborts adding targets before changing legacy files', (t) => {
  const root = project(t);
  legacyInstall(root);
  put(root, '.claude/agents/advisor.md', 'My advisor');
  const manifest = get(root, MANIFEST);
  assert.equal(invoke(root, 'init', '--target', 'all').code, 1);
  assert.equal(get(root, MANIFEST), manifest);
  assert.equal(get(root, SKILL), `Original v0.1 content: ${SKILL}\n`);
  assert.equal(fs.existsSync(path.join(root, '.github/agents/advisor.agent.md')), false);
});

test('rejects unknown instruction paths in manifest before deletion', (t) => {
  const root = project(t);
  invoke(root, 'init');
  const manifest = JSON.parse(get(root, MANIFEST));
  manifest.instructions['victim.md'] = manifest.instructions['CLAUDE.md'];
  delete manifest.instructions['CLAUDE.md'];
  put(root, MANIFEST, JSON.stringify(manifest));
  assert.throws(() => invoke(root, 'remove'), /manifest/);
  assert.ok(get(root, SKILL));
});

const HOST_PATHS = {
  codex: { directory: '.codex', skill: SKILL, instructions: 'AGENTS.md' },
  copilot: { directory: '.github', skill: '.github/skills/model-advisor/SKILL.md', instructions: '.github/copilot-instructions.md' },
  claude: { directory: '.claude', skill: '.claude/skills/model-advisor/SKILL.md', instructions: 'CLAUDE.md' },
};

for (const target of Object.keys(HOST_PATHS)) {
  test(`isolated ${target} installation does not create other host files`, (t) => {
    const root = project(t);
    const result = invoke(root, 'init', '--target', target);
    assert.equal(result.code, 0);
    const manifest = JSON.parse(get(root, MANIFEST));
    assert.deepEqual(manifest.targets, [target]);
    for (const [host, paths] of Object.entries(HOST_PATHS)) {
      assert.equal(fs.existsSync(path.join(root, paths.directory)), host === target);
      assert.equal(fs.existsSync(path.join(root, paths.skill)), host === target);
      assert.equal(fs.existsSync(path.join(root, paths.instructions)), host === target);
    }
    assert.equal(invoke(root, 'status').healthy, true);
    assert.deepEqual(invoke(root, 'update').changes, []);
    assert.equal(invoke(root, 'remove', '--target', target).code, 0);
    for (const paths of Object.values(HOST_PATHS)) {
      assert.equal(fs.existsSync(path.join(root, paths.skill)), false);
      assert.equal(fs.existsSync(path.join(root, paths.instructions)), false);
    }
    assert.equal(fs.existsSync(path.join(root, MANIFEST)), false);
  });
}

test('fresh init without --target defaults to Codex and remembers the selection', (t) => {
  const root = project(t);
  let result;
  assert.equal(run(['init', '--path', root, '--json'], root, (text) => { result = JSON.parse(text); }), 0);
  assert.deepEqual(result.targets, ['codex']);
  assert.equal(fs.existsSync(path.join(root, '.github')), false);
  assert.equal(fs.existsSync(path.join(root, '.claude')), false);
  assert.deepEqual(invoke(root, 'update').changes, []);
  assert.deepEqual(invoke(root, 'status').targets, ['codex']);
});

test('adding and removing one target preserves other targets and shared context', (t) => {
  const root = project(t);
  invoke(root, 'init', '--target', 'codex');
  const codexSkill = get(root, SKILL);
  assert.equal(invoke(root, 'init', '--target', 'copilot').code, 0);
  assert.deepEqual(invoke(root, 'status').targets, ['codex', 'copilot']);
  assert.equal(get(root, SKILL), codexSkill);
  const context = get(root, '.advisor/context.json');
  const manifest = get(root, MANIFEST);
  assert.equal(invoke(root, 'remove', '--target', 'copilot', '--dry-run').code, 0);
  assert.equal(get(root, MANIFEST), manifest);
  assert.equal(invoke(root, 'remove', '--target', 'copilot').code, 0);
  assert.equal(get(root, SKILL), codexSkill);
  assert.equal(get(root, '.advisor/context.json'), context);
  assert.equal(fs.existsSync(path.join(root, '.github/agents/advisor.agent.md')), false);
  assert.deepEqual(invoke(root, 'status').targets, ['codex']);
  assert.equal(invoke(root, 'status').healthy, true);
  assert.equal(invoke(root, 'remove').code, 0);
  assert.equal(fs.existsSync(path.join(root, '.advisor')), false);
});

test('targeted lifecycle ignores modifications and symlinks belonging to other tools', (t) => {
  const root = project(t);
  invoke(root, 'init', '--target', 'all');
  put(root, '.claude/agents/advisor.md', 'User changes');
  put(root, 'CLAUDE.md', 'malformed <!-- codex-advisor:start -->');
  fs.unlinkSync(path.join(root, '.github/agents/advisor.agent.md'));
  fs.symlinkSync('/unrelated/file', path.join(root, '.github/agents/advisor.agent.md'));
  assert.equal(invoke(root, 'update', '--target', 'codex').code, 0);
  assert.equal(invoke(root, 'status', '--target', 'codex').healthy, true);
  assert.equal(invoke(root, 'remove', '--target', 'codex').code, 0);
  assert.equal(get(root, '.claude/agents/advisor.md'), 'User changes');
  assert.ok(fs.lstatSync(path.join(root, '.github/agents/advisor.agent.md')).isSymbolicLink());
});

test('a target can be removed and reinstalled without changing remaining ownership', (t) => {
  const root = project(t);
  invoke(root, 'init', '--target', 'all');
  const original = JSON.parse(get(root, MANIFEST));
  invoke(root, 'remove', '--target', 'claude');
  invoke(root, 'init', '--target', 'claude');
  const current = JSON.parse(get(root, MANIFEST));
  assert.deepEqual(current, original);
  assert.equal(invoke(root, 'status').healthy, true);
});

test('update never installs an unselected tool and reports invalid targets without writes', (t) => {
  const root = project(t);
  invoke(root, 'init', '--target', 'codex');
  const manifest = get(root, MANIFEST);
  for (const command of ['update', 'remove']) {
    assert.throws(() => invoke(root, command, '--target', 'claude'), /Kurulu olmayan hedef/);
  }
  for (const options of [['--target'], ['--target', 'unknown'], ['--target', 'codex', '--target', 'claude']]) {
    assert.throws(() => invoke(root, 'init', ...options), /--target/);
  }
  assert.equal(invoke(root, 'update', '--target', 'all').code, 0);
  assert.equal(invoke(root, 'status', '--target', 'claude').healthy, false);
  assert.equal(get(root, MANIFEST), manifest);
  assert.equal(fs.existsSync(path.join(root, '.claude')), false);
});

test('v0.1 update preserves Codex-only selection; v0.2 update preserves all tools', (t) => {
  const root = project(t);
  legacyInstall(root);
  assert.equal(invoke(root, 'update').code, 0);
  assert.deepEqual(invoke(root, 'status').targets, ['codex']);
  assert.equal(fs.existsSync(path.join(root, '.github')), false);
  assert.equal(fs.existsSync(path.join(root, '.claude')), false);
  invoke(root, 'init', '--target', 'all');
  const old = JSON.parse(get(root, MANIFEST));
  old.schemaVersion = 2;
  old.version = '0.2.0';
  delete old.targets;
  put(root, MANIFEST, JSON.stringify(old));
  assert.equal(invoke(root, 'update').code, 0);
  assert.deepEqual(invoke(root, 'status').targets, ['codex', 'copilot', 'claude']);
  assert.equal(invoke(root, 'status').healthy, true);
});

test('rejects manifest target tampering before removal', (t) => {
  const root = project(t);
  invoke(root, 'init', '--target', 'all');
  const manifest = JSON.parse(get(root, MANIFEST));
  for (const targets of [[], ['codex', 'codex'], ['unknown'], ['codex']]) {
    put(root, MANIFEST, JSON.stringify({ ...manifest, targets }));
    assert.throws(() => invoke(root, 'remove'), /manifest/);
    assert.ok(get(root, SKILL));
  }
});
