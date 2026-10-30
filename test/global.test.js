import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../src/advisor.js';

const MANIFEST = '.advisor/global/manifest.json';
const HOSTS = {
  codex: { skill: '.agents/skills/model-advisor/SKILL.md', agent: '.codex/agents/advisor.toml', instructions: '.codex/AGENTS.md' },
  copilot: { skill: '.copilot/skills/model-advisor/SKILL.md', agent: '.copilot/agents/advisor.agent.md', instructions: '.copilot/copilot-instructions.md' },
  claude: { skill: '.claude/skills/model-advisor/SKILL.md', agent: '.claude/agents/advisor.md', instructions: '.claude/CLAUDE.md' },
};
const get = (root, name) => fs.readFileSync(path.join(root, name), 'utf8');
const exists = (root, name) => fs.existsSync(path.join(root, name));
function put(root, name, text) {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), text);
}
function setup(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'advisor-global-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const home = path.join(temporary, 'personal home');
  const cwd = path.join(temporary, 'project');
  fs.mkdirSync(home);
  fs.mkdirSync(cwd);
  const invoke = (command, ...args) => {
    let result;
    const code = run([command, '--global', '--json', ...args], cwd,
      (text) => { result = JSON.parse(text); }, { homeDirectory: home, env: {} });
    return { code, ...result };
  };
  return { home, cwd, invoke };
}

test('global install uses native personal locations and absolute skill references from any project', (t) => {
  const { home, cwd, invoke } = setup(t);
  put(home, 'package.json', '{"scripts":{"test":"must not be detected"}}');
  const result = invoke('init', '--target', 'all');
  assert.equal(result.code, 0);
  assert.equal(result.scope, 'global');
  assert.equal(result.root, home);
  assert.equal(result.context, undefined);
  assert.deepEqual(fs.readdirSync(cwd), []);
  for (const files of Object.values(HOSTS)) {
    const skill = path.join(home, files.skill).split(path.sep).join('/');
    assert.ok(get(home, files.agent).includes(skill));
    assert.ok(get(home, files.instructions).includes(skill));
    assert.match(get(home, files.instructions), /current project's .advisor\/context.json when present/);
    assert.match(get(home, files.agent), /This role is advisory: do not edit files/);
    assert.ok(exists(home, files.skill));
  }
  assert.equal(exists(home, '.github'), false);
  assert.equal(exists(home, 'AGENTS.md'), false);
  assert.equal(exists(home, 'CLAUDE.md'), false);
  assert.equal(exists(home, '.advisor/context.json'), false);
  const manifest = JSON.parse(get(home, MANIFEST));
  assert.equal(manifest.scope, 'global');
  assert.equal(Object.keys(manifest.files).length, 15);
  assert.deepEqual(invoke('init', '--target', 'all').changes, []);
  assert.deepEqual(invoke('update').changes, []);
  assert.equal(invoke('status').healthy, true);
});

test('global dry-run, missing status and no-op removal do not write anywhere', (t) => {
  const { home, cwd, invoke } = setup(t);
  assert.equal(invoke('status').code, 1);
  assert.equal(invoke('remove').code, 0);
  assert.equal(invoke('init', '--target', 'all', '--dry-run').code, 0);
  assert.deepEqual(fs.readdirSync(home), []);
  assert.deepEqual(fs.readdirSync(cwd), []);
  assert.throws(() => invoke('update'), /advisor init --global/);
  for (const args of [['--path', cwd], ['--path', home]]) {
    assert.throws(() => invoke('init', ...args), /--global ve --path/);
  }
  assert.deepEqual(fs.readdirSync(home), []);
});

test('global and project lifecycles are independent', (t) => {
  const { home, cwd, invoke } = setup(t);
  const projectRun = (command) => run([command, '--target', 'all', '--path', cwd], cwd, () => {});
  assert.equal(projectRun('init'), 0);
  const projectManifest = get(cwd, '.advisor/manifest.json');
  assert.equal(invoke('init', '--target', 'all').code, 0);
  const globalManifest = get(home, MANIFEST);
  assert.equal(projectRun('update'), 0);
  assert.equal(get(home, MANIFEST), globalManifest);
  assert.equal(invoke('remove').code, 0);
  assert.equal(get(cwd, '.advisor/manifest.json'), projectManifest);
  assert.equal(invoke('init', '--target', 'all').code, 0);
  assert.equal(projectRun('remove'), 0);
  assert.equal(get(home, MANIFEST), globalManifest);
  assert.equal(invoke('status').healthy, true);
});

test('global target selection defaults to Codex and remembers added and removed hosts', (t) => {
  const { home, invoke } = setup(t);
  assert.deepEqual(invoke('init').targets, ['codex']);
  assert.equal(exists(home, '.copilot'), false);
  assert.equal(exists(home, '.claude'), false);
  assert.throws(() => invoke('update', '--target', 'claude'), /Kurulu olmayan hedef/);
  assert.equal(invoke('status', '--target', 'all').healthy, false);
  assert.equal(invoke('init', '--target', 'copilot').code, 0);
  assert.deepEqual(invoke('status').targets, ['codex', 'copilot']);
  const codex = get(home, HOSTS.codex.agent);
  assert.equal(invoke('remove', '--target', 'copilot').code, 0);
  assert.equal(get(home, HOSTS.codex.agent), codex);
  assert.equal(exists(home, HOSTS.copilot.agent), false);
  assert.equal(invoke('status').healthy, true);
  assert.equal(invoke('remove').code, 0);
  assert.equal(exists(home, MANIFEST), false);
  assert.equal(exists(home, '.advisor/global'), false);
});

test('global install preserves personal instruction bytes and settings through removal', (t) => {
  const { home, invoke } = setup(t);
  const original = '# My preferences\r\nKeep these.\r\n';
  for (const host of Object.values(HOSTS)) put(home, host.instructions, original);
  for (const name of ['.codex/config.toml', '.claude/settings.json', '.copilot/settings.json']) put(home, name, 'user settings');
  assert.equal(invoke('init', '--target', 'all').code, 0);
  for (const host of Object.values(HOSTS)) {
    put(home, host.instructions, 'Before\n' + get(home, host.instructions) + '\nAfter\n');
  }
  assert.equal(invoke('update').code, 0);
  assert.equal(invoke('remove').code, 0);
  for (const host of Object.values(HOSTS)) {
    assert.equal(get(home, host.instructions), 'Before\n' + original + '\nAfter\n');
  }
  for (const name of ['.codex/config.toml', '.claude/settings.json', '.copilot/settings.json']) {
    assert.equal(get(home, name), 'user settings');
  }
});

test('global file collisions abort the whole install without touching personal files', (t) => {
  const { home, invoke } = setup(t);
  put(home, HOSTS.claude.agent, 'User advisor');
  assert.equal(invoke('init', '--target', 'all').code, 1);
  assert.equal(get(home, HOSTS.claude.agent), 'User advisor');
  assert.equal(exists(home, HOSTS.codex.agent), false);
  assert.equal(exists(home, MANIFEST), false);
});

test('global borrowed agents survive removal, while modified managed files block it', (t) => {
  const { home, invoke } = setup(t);
  invoke('init');
  const name = HOSTS.codex.agent;
  const agent = get(home, name);
  invoke('remove');
  put(home, name, agent);
  invoke('init');
  assert.equal(JSON.parse(get(home, MANIFEST)).files[name].owned, false);
  assert.equal(invoke('remove').code, 0);
  assert.equal(get(home, name), agent);
  invoke('init', '--target', 'all');
  const manifest = get(home, MANIFEST);
  put(home, HOSTS.claude.agent, 'Modified');
  assert.equal(invoke('update').code, 1);
  assert.equal(invoke('remove').code, 1);
  assert.equal(get(home, MANIFEST), manifest);
  assert.equal(get(home, HOSTS.claude.agent), 'Modified');
  assert.equal(invoke('remove', '--target', 'copilot').code, 0);
  assert.equal(get(home, HOSTS.claude.agent), 'Modified');
});

test('modified personal instruction blocks prevent all global writes', (t) => {
  const { home, invoke } = setup(t);
  invoke('init', '--target', 'all');
  const name = HOSTS.codex.instructions;
  put(home, name, get(home, name).replace('## Advisor', '## Custom Advisor'));
  const manifest = get(home, MANIFEST);
  assert.equal(invoke('update').code, 1);
  assert.equal(invoke('remove').code, 1);
  assert.equal(get(home, MANIFEST), manifest);
  assert.equal(invoke('status').healthy, false);
});

test('global manifest rejects project scope and arbitrary file ownership before deletion', (t) => {
  const { home, invoke } = setup(t);
  invoke('init', '--target', 'all');
  const original = JSON.parse(get(home, MANIFEST));
  put(home, MANIFEST, JSON.stringify({ ...original, scope: 'project' }));
  assert.throws(() => invoke('remove'), /manifest/);
  const changed = structuredClone(original);
  changed.files['victim.md'] = changed.files[HOSTS.codex.agent];
  delete changed.files[HOSTS.codex.agent];
  put(home, MANIFEST, JSON.stringify(changed));
  assert.throws(() => invoke('remove'), /manifest/);
  assert.ok(exists(home, HOSTS.codex.agent));
});

test('global install refuses symlinked host directories and honors its separate lock', (t) => {
  const { home, cwd, invoke } = setup(t);
  fs.symlinkSync(cwd, path.join(home, '.claude'));
  assert.throws(() => invoke('init', '--target', 'all'), /Sembolik bağlantı/);
  assert.equal(exists(home, HOSTS.codex.agent), false);
  assert.deepEqual(fs.readdirSync(cwd), []);
  put(home, '.advisor/global/lock', 'busy');
  assert.throws(() => invoke('init'), /Başka bir advisor işlemi/);
  assert.equal(get(home, '.advisor/global/lock'), 'busy');
});

test('global install reports unsupported redirected host homes without writing', (t) => {
  const { home, cwd } = setup(t);
  for (const [target, variable] of [['codex', 'CODEX_HOME'], ['copilot', 'COPILOT_HOME'], ['claude', 'CLAUDE_CONFIG_DIR']]) {
    assert.throws(() => run(['init', '--global', '--target', target], cwd, () => {},
      { homeDirectory: home, env: { [variable]: '/different/config' } }), new RegExp(variable));
  }
  assert.deepEqual(fs.readdirSync(home), []);
});
