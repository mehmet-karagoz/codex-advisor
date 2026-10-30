import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version;
const START = '<!-- codex-advisor:start -->';
const END = '<!-- codex-advisor:end -->';
const MANIFEST = '.advisor/manifest.json';
const CONTEXT = '.advisor/context.json';
const ROLES = ['advisor', 'fast-worker', 'standard-worker', 'deep-expert'];
const TARGETS = {
  codex: {
    files: ['.agents/skills/model-advisor/SKILL.md',
      ...ROLES.map((role) => `.codex/agents/${role}.toml`)],
    instructions: 'AGENTS.md',
  },
  copilot: {
    files: ['.github/skills/model-advisor/SKILL.md',
      ...ROLES.map((role) => `.github/agents/${role}.agent.md`)],
    instructions: '.github/copilot-instructions.md',
  },
  claude: {
    files: ['.claude/skills/model-advisor/SKILL.md',
      ...ROLES.map((role) => `.claude/agents/${role}.md`)],
    instructions: 'CLAUDE.md',
  },
};
const ALL_TARGETS = Object.keys(TARGETS);
const orderedTargets = (targets) => ALL_TARGETS.filter((target) => targets.includes(target));
const PROJECT = { global: false, targets: TARGETS, directory: '.advisor', manifest: MANIFEST, context: CONTEXT };
const GLOBAL = {
  global: true, directory: '.advisor/global', manifest: '.advisor/global/manifest.json', context: null,
  targets: {
    codex: { files: TARGETS.codex.files, instructions: '.codex/AGENTS.md' },
    copilot: { files: TARGETS.copilot.files.map((name) => name.replace('.github/', '.copilot/')),
      instructions: '.copilot/copilot-instructions.md' },
    claude: { files: TARGETS.claude.files, instructions: '.claude/CLAUDE.md' },
  },
};
const managedFiles = (targets, layout) => [...targets.flatMap((target) => layout.targets[target].files),
  ...(layout.context ? [layout.context] : [])];
const instructionFiles = (targets, layout) => targets.map((target) => layout.targets[target].instructions);
function manifestText(targets, files, instructions, layout) {
  return json({ schemaVersion: 3, version, profile: 'base', ...(layout.global ? { scope: 'global' } : {}),
    targets, files, instructions });
}
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

// Reject links in every managed path, including links to directories outside the project.
function safePath(root, relative) {
  if (!relative || path.isAbsolute(relative) || relative.split('/').includes('..')) {
    throw new Error(`Geçersiz dosya yolu: ${relative}`);
  }
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Sembolik bağlantıya dokunulmadı: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return current;
}

function read(root, relative) {
  try {
    return fs.readFileSync(safePath(root, relative), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function projectRoot(directory, explicit) {
  const resolved = fs.realpathSync(directory);
  if (!fs.statSync(resolved).isDirectory()) throw new Error(`Proje yolu klasör olmalı: ${resolved}`);
  if (explicit) return resolved;
  for (let current = resolved; ; current = path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    if (path.dirname(current) === current) return resolved;
  }
}

function loadManifest(root, layout) {
  const source = read(root, layout.manifest);
  if (source === null) return null;
  let manifest;
  try { manifest = JSON.parse(source); } catch { throw new Error('Advisor manifest dosyası geçerli JSON değil.'); }
  const validHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const validRecord = (item) => item && typeof item.owned === 'boolean' && validHash(item.sha256);
  const validSection = (item) => item && validHash(item.sha256) && typeof item.existed === 'boolean'
    && ['', '\n', '\n\n', '\r\n', '\r\n\r\n'].includes(item.separator);
  const schema = manifest?.schemaVersion;
  if (![1, 2, 3].includes(schema)) throw new Error('Desteklenmeyen veya bozuk advisor manifest dosyası.');
  if (layout.global ? schema !== 3 || manifest.scope !== 'global' : manifest.scope !== undefined) {
    throw new Error('Advisor manifest kapsamı geçersiz.');
  }
  const targets = schema === 1 ? ['codex'] : schema === 2 ? ALL_TARGETS : manifest.targets;
  if (!Array.isArray(targets) || targets.length === 0 || targets.length > ALL_TARGETS.length
    || new Set(targets).size !== targets.length || !targets.every((target) => Object.hasOwn(TARGETS, target))) {
    throw new Error('Desteklenmeyen veya bozuk advisor manifest dosyası.');
  }
  // Older releases did not install a Codex advisor. Accept that exact legacy
  // file set, without claiming ownership of an existing untracked advisor.
  const expected = managedFiles(targets, layout).filter((name) =>
    layout.global || name !== '.codex/agents/advisor.toml' || Object.hasOwn(manifest.files ?? {}, name));
  const expectedInstructions = instructionFiles(targets, layout);
  if (!manifest.files || typeof manifest.files !== 'object'
    || Array.isArray(manifest.files) || Object.keys(manifest.files).length !== expected.length
    || !expected.every((name) => validRecord(manifest.files[name]))
    || (schema === 1 ? !validSection(manifest.agents)
      : !manifest.instructions || Array.isArray(manifest.instructions)
        || Object.keys(manifest.instructions).length !== expectedInstructions.length
        || !expectedInstructions.every((name) => validSection(manifest.instructions[name])))) {
    throw new Error('Desteklenmeyen veya bozuk advisor manifest dosyası.');
  }
  // Normalize legacy ownership without writing until the complete plan has passed validation.
  if (schema === 1) manifest.instructions = { 'AGENTS.md': manifest.agents };
  manifest.targets = orderedTargets(targets);
  return manifest;
}

function section(text, name = 'AGENTS.md') {
  const source = text ?? '';
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (start === -1 && end === -1) return null;
  if (start === -1 || end < start || source.indexOf(START, start + START.length) !== -1
    || source.indexOf(END, end + END.length) !== -1) {
    throw new Error(`${name} içinde advisor bölüm işaretleri bozuk veya birden fazla.`);
  }
  const finish = end + END.length;
  return { start, end: finish, text: source.slice(start, finish) };
}

function detect(root) {
  const markers = {
    'package.json': 'JavaScript/TypeScript', 'tsconfig.json': 'TypeScript',
    'pyproject.toml': 'Python', 'requirements.txt': 'Python', 'Cargo.toml': 'Rust',
    'go.mod': 'Go', 'pom.xml': 'Java', 'build.gradle': 'Java/Kotlin',
    'composer.json': 'PHP', 'Gemfile': 'Ruby',
  };
  const manifests = Object.keys(markers).filter((name) => fs.existsSync(path.join(root, name)));
  const technologies = [...new Set(manifests.map((name) => markers[name]))];
  const frameworks = [];
  const scripts = {};
  const warnings = [];
  if (manifests.includes('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const [name, label] of Object.entries({ next: 'Next.js', react: 'React', vue: 'Vue',
        nuxt: 'Nuxt', svelte: 'Svelte', express: 'Express', '@nestjs/core': 'NestJS',
        vitest: 'Vitest', jest: 'Jest', '@playwright/test': 'Playwright' })) {
        if (Object.hasOwn(deps, name)) frameworks.push(label);
      }
      for (const name of ['test', 'lint', 'build', 'typecheck', 'check']) {
        if (typeof pkg.scripts?.[name] === 'string') scripts[name] = pkg.scripts[name];
      }
    } catch { warnings.push('package.json okunamadı; teknoloji tespiti kısmi.'); }
  }
  const lockfiles = ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'bun.lock', 'bun.lockb']
    .filter((name) => fs.existsSync(path.join(root, name)));
  return { schemaVersion: 1, profile: 'base', manifests, technologies, frameworks, lockfiles, scripts, warnings };
}

// Personal agent instructions must resolve their skill from every working directory.
function globalReferences(text, root) {
  const absolutePath = (name) => path.resolve(root, name).split(path.sep).join('/');
  text = text.replaceAll('.github/copilot-instructions.md', absolutePath('.copilot/copilot-instructions.md'))
    .replaceAll('and CLAUDE.md.', `and ${absolutePath('.claude/CLAUDE.md')}.`);
  for (const [local, personal] of [
    ['.agents/skills/', '.agents/skills/'], ['.codex/agents/', '.codex/agents/'],
    ['.github/skills/', '.copilot/skills/'], ['.github/agents/', '.copilot/agents/'],
    ['.claude/skills/', '.claude/skills/'], ['.claude/agents/', '.claude/agents/'],
  ]) {
    const absolute = absolutePath(personal) + '/';
    text = text.replaceAll(local, absolute);
  }
  return text;
}

function desiredFiles(root, targets, layout) {
  const files = {};
  for (const target of targets) {
    for (const [index, name] of layout.targets[target].files.entries()) {
      const template = name.endsWith('/SKILL.md')
        ? '.agents/skills/model-advisor/SKILL.md' : TARGETS[target].files[index];
      const text = fs.readFileSync(path.join(packageRoot, 'templates', template), 'utf8');
      files[name] = layout.global ? globalReferences(text, root) : text;
    }
  }
  if (layout.context) files[layout.context] = json(detect(root));
  return files;
}

function desiredSection(name, root, layout) {
  const host = ALL_TARGETS.find((target) => layout.targets[target].instructions === name);
  const skillPath = layout.targets[host].files[0];
  const skill = layout.global ? path.join(root, skillPath).split(path.sep).join('/') : skillPath;
  const context = layout.global
    ? "Read the current project's .advisor/context.json when present; verify its hints against that project."
    : 'Read .advisor/context.json for detected project technologies and validation scripts; verify these hints before using them.';
  const routing = host === 'codex'
    ? 'Start the main session with gpt-6-sol / medium for normal development. Use standard_worker for delegated implementation, fast_worker for simple isolated tasks, advisor (gpt-6.1-sol / high) for advice when warranted, and deep_expert for difficult investigations.'
    : 'Start the main session with Claude Sonnet 5.5 for normal development; standard-worker is the implementation agent. Use fast-worker (Claude Haiku 5.5) for simple isolated tasks, advisor (Claude Opus 5.5) for advice when warranted, and deep-expert (Claude Opus 5.5) for difficult investigations. Invoke configured agents by exact name without per-call model overrides.';
  return `${START}\n## Advisor\n\nRead ${skill} when planning development work.\n${context}\nEvaluate complexity before substantial execution. Delegate only when it improves efficiency or quality.\n${routing}\nThe standard main session owns implementation and validation. Consult advisor only for meaningful architectural decisions, uncertainty or risk; advisor returns analysis and recommendations without changing project files or coordinating implementation. Resume work in the standard main session after consultation.\nWhen running as a worker subagent, return uncertainty to the caller so it can consult advisor; do not create recursive consultation chains.\nKeep short tasks in the main session when delegation overhead outweighs its benefit. Keep the main session model unchanged. Do not ask the user to choose an agent or model for every task.\nUse the host's native agent tool only when available. Never claim a model switch or delegation that did not happen.\nIf delegation or a configured model is unavailable, disclose the limitation and continue with the current model when sufficient. Recommend a manual switch only if current capabilities are insufficient; never silently substitute a configured model. Carry authorized implementation through validation; respect requests only for advice or planning.\n${END}`;
}

function planInstall(root, manifest, targets, layout) {
  const files = desiredFiles(root, targets, layout);
  const changes = [];
  const records = { ...manifest?.files };
  const conflicts = [];
  for (const [name, next] of Object.entries(files)) {
    const current = read(root, name);
    const previous = manifest?.files[name];
    if (previous?.owned && current !== null && hash(current) !== previous.sha256) {
      conflicts.push(`${name}: kurulumdan sonra değiştirilmiş`);
    } else if ((!previous || !previous.owned) && current !== null && current !== next) {
      conflicts.push(`${name}: mevcut kullanıcı dosyası`);
    }
    const owned = previous?.owned ?? (current === null);
    records[name] = { owned: owned || current === null, sha256: hash(next) };
    if (current !== next) changes.push({ path: name, before: current, after: next });
  }
  const instructions = { ...manifest?.instructions };
  for (const name of instructionFiles(targets, layout)) {
    const original = read(root, name);
    const found = section(original, name);
    const previous = manifest?.instructions[name];
    if (previous && found && hash(found.text) !== previous.sha256) {
      conflicts.push(`${name}: advisor bölümü değiştirilmiş`);
    } else if (!previous && found) {
      conflicts.push(`${name}: kaydı olmayan bir advisor bölümü var`);
    }
    const block = desiredSection(name, root, layout);
    const separator = found ? previous?.separator ?? ''
      : !original ? '' : original.endsWith('\n\n') || original.endsWith('\r\n\r\n') ? ''
        : original.endsWith('\n') ? '\n' : '\n\n';
    const next = found
      ? original.slice(0, found.start) + block + original.slice(found.end)
      : (original ?? '') + separator + block;
    if (original !== next) changes.push({ path: name, before: original, after: next });
    instructions[name] = { sha256: hash(block), separator, existed: previous?.existed ?? (original !== null) };
  }
  const nextManifest = manifestText(orderedTargets([...(manifest?.targets ?? []), ...targets]), records, instructions, layout);
  const oldManifest = read(root, layout.manifest);
  if (oldManifest !== nextManifest) changes.push({ path: layout.manifest, before: oldManifest, after: nextManifest });
  return { changes, conflicts, ...(layout.context ? { context: JSON.parse(files[layout.context]) } : {}) };
}

function planRemove(root, manifest, targets, layout) {
  const changes = [];
  const conflicts = [];
  const remainingTargets = manifest.targets.filter((target) => !targets.includes(target));
  const records = { ...manifest.files };
  const instructions = { ...manifest.instructions };
  const removals = targets.flatMap((target) => layout.targets[target].files);
  if (!remainingTargets.length && layout.context) removals.push(layout.context);
  for (const name of removals) {
    const record = records[name];
    delete records[name];
    if (!record?.owned) continue;
    const current = read(root, name);
    if (current === null) continue;
    if (hash(current) !== record.sha256) conflicts.push(`${name}: kurulumdan sonra değiştirilmiş`);
    else changes.push({ path: name, before: current, after: null });
  }
  for (const name of instructionFiles(targets, layout)) {
    const record = instructions[name];
    delete instructions[name];
    const original = read(root, name);
    const found = section(original, name);
    if (!found) continue;
    if (hash(found.text) !== record.sha256) conflicts.push(`${name}: advisor bölümü değiştirilmiş`);
    else {
      const separator = record.separator;
      const start = separator && original.slice(0, found.start).endsWith(separator)
        ? found.start - separator.length : found.start;
      const remaining = original.slice(0, start) + original.slice(found.end);
      changes.push({ path: name, before: original,
        after: remaining || (record.existed ? '' : null) });
    }
  }
  changes.push({ path: layout.manifest, before: read(root, layout.manifest),
    after: remainingTargets.length ? manifestText(remainingTargets, records, instructions, layout) : null });
  return { changes, conflicts };
}

function write(root, name, value) {
  const target = safePath(root, name);
  if (value === null) {
    if (fs.existsSync(target)) fs.unlinkSync(target);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, value, { flag: 'wx' });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function apply(root, plan, layout) {
  const directory = safePath(root, layout.directory);
  const directoryExisted = fs.existsSync(directory);
  fs.mkdirSync(directory, { recursive: true });
  const lockPath = `${layout.directory}/lock`;
  const lock = safePath(root, lockPath);
  let descriptor;
  try { descriptor = fs.openSync(lock, 'wx'); } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Başka bir advisor işlemi çalışıyor (${lockPath}).`);
    throw error;
  }
  const applied = [];
  try {
    // Recheck after acquiring the lock so a stale plan never overwrites another invocation.
    for (const change of plan.changes) {
      if (read(root, change.path) !== change.before) throw new Error(`İşlem sırasında dosya değişti: ${change.path}`);
    }
    for (const change of plan.changes) {
      write(root, change.path, change.after);
      applied.push(change);
    }
  } catch (error) {
    for (const change of applied.reverse()) write(root, change.path, change.before);
    throw error;
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(lock);
    if (!directoryExisted || plan.changes.some((item) => item.path === layout.manifest && item.after === null)) {
      try { fs.rmdirSync(directory); } catch (error) {
        if (!['ENOTEMPTY', 'ENOENT'].includes(error.code)) throw error;
      }
    }
  }
}

function status(root, manifest, targets, layout) {
  if (!manifest) return { installed: false, healthy: false, files: [], message: `Advisor kurulu değil. advisor init${layout.global ? ' --global' : ''} çalıştırın.` };
  const desired = desiredFiles(root, targets, layout);
  const files = managedFiles(targets, layout).map((name) => {
    const current = read(root, name);
    const record = manifest.files[name];
    const state = current === null ? 'missing' : !record ? 'outdated' : hash(current) !== record.sha256 ? 'modified'
      : current !== desired[name] ? 'outdated' : 'ok';
    return { path: name, owned: record?.owned ?? false, state };
  });
  for (const name of instructionFiles(targets, layout)) {
    const block = section(read(root, name), name);
    const record = manifest.instructions[name];
    files.push({ path: `${name} (advisor)`, state: !block ? 'missing'
      : !record ? 'outdated' : hash(block.text) !== record.sha256 ? 'modified'
        : block.text !== desiredSection(name, root, layout) ? 'outdated' : 'ok' });
  }
  return { installed: true, targets: manifest.targets, checkedTargets: targets,
    healthy: targets.every((target) => manifest.targets.includes(target))
      && files.every((item) => item.state === 'ok') && manifest.version === version,
    installedVersion: manifest.version, availableVersion: version, files, ...(layout.context ? { context: detect(root) } : {}) };
}

const HELP = `codex-advisor ${version}\n\nKullanım: advisor <init|status|update|remove> [--target <codex|copilot|claude|all>] [--path <klasör> | --global] [--dry-run] [--json]\n\n  init       Seçilen aracın skill ve ajanlarını kurar; mevcut kuruluma hedef ekleyebilir.\n  status     Kurulumu, dosya değişikliklerini ve proje teknolojilerini gösterir.\n  update     Mevcut kurulumu bu CLI sürümündeki şablonlarla günceller.\n  remove     Seçilen veya tüm kurulu hedefleri kaldırır; diğer araçlara dokunmaz.\n\nYeni kurulumda varsayılan araç codex; mevcut kurulumda kayıtlı araçlar kullanılır.\n--target all üç aracı seçer; update yalnızca kurulu hedefleri günceller.\nVarsayılan proje Git kökü; Git dışında geçerli klasör. --path tam hedefi seçer.\n--global kullanıcı düzeyine kurar (Codex, Claude Code, Copilot CLI); --path ile kullanılamaz.\nProje ve global kurulumlar ayrı yönetilir; global kapsamda proje teknolojisi tespit edilmez.\n--dry-run dosya yazmadan değişiklikleri gösterir. --json yapılandırılmış çıktı verir.\n--help yardım, --version sürüm bilgisini gösterir.\n`;

// This release installs into documented default personal locations only.
// Refuse to claim success in an inactive directory when a host redirects its home.
function validateGlobalHomes(root, targets, env) {
  for (const [target, variable, directory] of [
    ['codex', 'CODEX_HOME', '.codex'], ['copilot', 'COPILOT_HOME', '.copilot'],
    ['claude', 'CLAUDE_CONFIG_DIR', '.claude'],
  ]) {
    if (targets.includes(target) && env[variable]
      && path.resolve(env[variable]) !== path.join(root, directory)) {
      throw new Error(`--global özel ${variable} yolunu henüz desteklemiyor; varsayılan ${path.join(root, directory)} kullanılır.`);
    }
  }
}

export function run(args, cwd = process.cwd(), output = console.log, options = {}) {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) { output(HELP); return 0; }
  if (args.length === 1 && args[0] === '--version') { output(version); return 0; }
  const command = args[0];
  if (!['init', 'status', 'update', 'remove'].includes(command)) throw new Error(`Bilinmeyen komut: ${command}`);
  let directory = cwd;
  let explicit = false;
  let dryRun = false;
  let asJson = false;
  let global = false;
  let requestedTarget;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--path') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('--path bir klasör gerektirir.');
      directory = path.resolve(cwd, args[++i]); explicit = true;
    } else if (args[i] === '--target') {
      if (requestedTarget !== undefined) throw new Error('--target yalnızca bir kez verilebilir.');
      requestedTarget = args[++i];
      if (!['all', ...ALL_TARGETS].includes(requestedTarget)) {
        throw new Error('--target codex, copilot, claude veya all olmalı.');
      }
    } else if (args[i] === '--global') global = true;
    else if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--json') asJson = true;
    else throw new Error(`Bilinmeyen seçenek: ${args[i]}`);
  }
  if (global && explicit) throw new Error('--global ve --path birlikte kullanılamaz.');
  const layout = global ? GLOBAL : PROJECT;
  const root = global ? fs.realpathSync(options.homeDirectory ?? os.homedir()) : projectRoot(directory, explicit);
  const manifest = loadManifest(root, layout);
  const targets = requestedTarget === 'all'
    ? command === 'init' || command === 'status' ? ALL_TARGETS : manifest?.targets ?? ALL_TARGETS
    : requestedTarget ? [requestedTarget] : manifest?.targets ?? ['codex'];
  if (global) validateGlobalHomes(root, targets, options.env ?? process.env);
  const scope = global ? 'global' : 'project';
  const label = global ? `${root} (global)` : root;
  if (command === 'status') {
    const result = { root, scope, ...status(root, manifest, targets, layout) };
    output(asJson ? json(result).trimEnd() : [label, result.message ?? `Advisor ${result.installedVersion} (${result.targets.join(', ')})`,
      ...(result.files.map((item) => `${item.state.padEnd(9)} ${item.path}${item.owned === false ? ' (mevcut dosya)' : ''}`)),
      ...(result.context ? [`Teknolojiler: ${[...result.context.technologies, ...result.context.frameworks].join(', ') || 'tespit edilemedi'}`] : []),
    ].join('\n'));
    return result.healthy ? 0 : 1;
  }
  if (command === 'update' && !manifest) throw new Error(`Advisor kurulu değil. Önce advisor init${global ? ' --global' : ''} çalıştırın.`);
  if (command === 'remove' && !manifest) {
    output(asJson ? json({ root, scope, command, changes: [], conflicts: [] }).trimEnd() : 'Advisor kurulu değil; değişiklik yapılmadı.');
    return 0;
  }
  if (manifest && ['update', 'remove'].includes(command)) {
    const missing = targets.filter((target) => !manifest.targets.includes(target));
    if (missing.length) throw new Error(`Kurulu olmayan hedef: ${missing.join(', ')}. Eklemek için advisor init --target <hedef> kullanın.`);
  }
  const plan = command === 'remove' ? planRemove(root, manifest, targets, layout) : planInstall(root, manifest, targets, layout);
  const result = { root, scope, command, targets, dryRun, changes: plan.changes.map((item) => ({ path: item.path,
    action: item.after === null ? 'remove' : item.before === null ? 'create' : 'update' })),
  conflicts: plan.conflicts, ...(plan.context ? { context: plan.context } : {}) };
  if (!plan.conflicts.length && !dryRun && plan.changes.length) apply(root, plan, layout);
  output(asJson ? json(result).trimEnd() : [label,
    ...(plan.conflicts.length ? ['Çakışma var; hiçbir dosya değiştirilmedi.', ...plan.conflicts,
      'Değişikliklerinizi yedekleyip çakışmayı giderdikten sonra tekrar çalıştırın.']
      : [dryRun ? 'Önizleme; dosyalar değiştirilmedi.' : 'İşlem tamamlandı.',
        ...result.changes.map((item) => `${item.action.padEnd(7)} ${item.path}`),
        ...(!result.changes.length ? ['Kurulum zaten güncel; değişiklik yok.'] : []),
        ...(plan.context ? [`Teknolojiler: ${[...plan.context.technologies, ...plan.context.frameworks].join(', ') || 'tespit edilemedi'}`,
          ...plan.context.warnings] : []),
        ...(command === 'init' ? targets.map((target) => ({
          codex: 'Codex: gpt-6-sol / medium ile başlayın; $model-advisor gerektiğinde güçlü advisor ajanına danışmayı yönlendirir.',
          copilot: 'Copilot: standard-worker (Claude Sonnet 5.5) ile başlayın; gerektiğinde güçlü advisor ajanına danışır, uygulamaya standart model devam eder.',
          claude: 'Claude Code: Sonnet 5.5 ile başlayın; /model-advisor gerektiğinde güçlü advisor ajanına danışmayı yönlendirir.',
        })[target]) : []),
      ]),
  ].join('\n'));
  return plan.conflicts.length ? 1 : 0;
}
