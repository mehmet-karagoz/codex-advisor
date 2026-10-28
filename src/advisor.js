import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version;
const START = '<!-- codex-advisor:start -->';
const END = '<!-- codex-advisor:end -->';
const MANIFEST = '.advisor/manifest.json';
const CONTEXT = '.advisor/context.json';
const TEMPLATES = [
  '.agents/skills/model-advisor/SKILL.md',
  '.codex/agents/fast-worker.toml',
  '.codex/agents/standard-worker.toml',
  '.codex/agents/deep-expert.toml',
];
const MANAGED = [...TEMPLATES, CONTEXT];
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

function loadManifest(root) {
  const source = read(root, MANIFEST);
  if (source === null) return null;
  let manifest;
  try { manifest = JSON.parse(source); } catch { throw new Error('Advisor manifest dosyası geçerli JSON değil.'); }
  const validHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  if (manifest.schemaVersion !== 1 || !manifest.files || typeof manifest.files !== 'object'
    || Array.isArray(manifest.files) || !manifest.agents
    || !validHash(manifest.agents.sha256) || typeof manifest.agents.existed !== 'boolean'
    || typeof manifest.agents.separator !== 'string'
    || !['', '\n', '\n\n', '\r\n', '\r\n\r\n'].includes(manifest.agents.separator)
    || Object.keys(manifest.files).length !== MANAGED.length
    || !MANAGED.every((name) => {
      const item = manifest.files[name];
      return item && typeof item.owned === 'boolean' && validHash(item.sha256);
    })) throw new Error('Desteklenmeyen veya bozuk advisor manifest dosyası.');
  return manifest;
}

function section(text) {
  const source = text ?? '';
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (start === -1 && end === -1) return null;
  if (start === -1 || end < start || source.indexOf(START, start + START.length) !== -1
    || source.indexOf(END, end + END.length) !== -1) {
    throw new Error('AGENTS.md içinde advisor bölüm işaretleri bozuk veya birden fazla.');
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

function desiredFiles(root) {
  const files = Object.fromEntries(TEMPLATES.map((name) => [name,
    fs.readFileSync(path.join(packageRoot, 'templates', name), 'utf8')]));
  files[CONTEXT] = json(detect(root));
  return files;
}

function desiredSection() {
  return `${START}\n## Advisor\n\nUse the model-advisor skill when planning development work.\nRead .advisor/context.json for detected project technologies and validation scripts; verify these hints against the current project before using them.\nEvaluate task complexity before substantial execution. Prefer fast_worker for simple isolated tasks, standard_worker for normal development, and deep_expert for complex investigations.\nDelegate only when it improves efficiency or quality. Keep the main session model unchanged.\nUse only models and reasoning efforts available in the current environment. If delegation is unavailable, recommend a manual model switch only when it materially helps.\n${END}`;
}

function planInstall(root, manifest) {
  const files = desiredFiles(root);
  const changes = [];
  const records = {};
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
  const original = read(root, 'AGENTS.md');
  const found = section(original);
  if (manifest && found && hash(found.text) !== manifest.agents.sha256) {
    conflicts.push('AGENTS.md: advisor bölümü değiştirilmiş');
  } else if (!manifest && found) {
    conflicts.push('AGENTS.md: kaydı olmayan bir advisor bölümü var');
  }
  const block = desiredSection();
  const separator = found ? manifest?.agents.separator ?? ''
    : !original ? '' : original.endsWith('\n\n') || original.endsWith('\r\n\r\n') ? ''
      : original.endsWith('\n') ? '\n' : '\n\n';
  const nextAgents = found
    ? original.slice(0, found.start) + block + original.slice(found.end)
    : (original ?? '') + separator + block;
  if (original !== nextAgents) changes.push({ path: 'AGENTS.md', before: original, after: nextAgents });
  const nextManifest = {
    schemaVersion: 1, version, profile: 'base', files: records,
    agents: { sha256: hash(block), separator, existed: manifest?.agents.existed ?? (original !== null) },
  };
  const oldManifest = read(root, MANIFEST);
  if (oldManifest !== json(nextManifest)) changes.push({ path: MANIFEST, before: oldManifest, after: json(nextManifest) });
  return { changes, conflicts, context: JSON.parse(files[CONTEXT]) };
}

function planRemove(root, manifest) {
  const changes = [];
  const conflicts = [];
  for (const [name, record] of Object.entries(manifest.files)) {
    if (!record.owned) continue;
    const current = read(root, name);
    if (current === null) continue;
    if (hash(current) !== record.sha256) conflicts.push(`${name}: kurulumdan sonra değiştirilmiş`);
    else changes.push({ path: name, before: current, after: null });
  }
  const original = read(root, 'AGENTS.md');
  const found = section(original);
  if (found) {
    if (hash(found.text) !== manifest.agents.sha256) conflicts.push('AGENTS.md: advisor bölümü değiştirilmiş');
    else {
      const separator = manifest.agents.separator;
      const start = separator && original.slice(0, found.start).endsWith(separator)
        ? found.start - separator.length : found.start;
      const remaining = original.slice(0, start) + original.slice(found.end);
      changes.push({ path: 'AGENTS.md', before: original,
        after: remaining || (manifest.agents.existed ? '' : null) });
    }
  }
  changes.push({ path: MANIFEST, before: read(root, MANIFEST), after: null });
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

function apply(root, plan) {
  const directory = safePath(root, '.advisor');
  const directoryExisted = fs.existsSync(directory);
  fs.mkdirSync(directory, { recursive: true });
  const lock = safePath(root, '.advisor/lock');
  let descriptor;
  try { descriptor = fs.openSync(lock, 'wx'); } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Başka bir advisor işlemi çalışıyor (.advisor/lock).');
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
    if (!directoryExisted || plan.changes.some((item) => item.path === MANIFEST && item.after === null)) {
      try { fs.rmdirSync(directory); } catch (error) {
        if (!['ENOTEMPTY', 'ENOENT'].includes(error.code)) throw error;
      }
    }
  }
}

function status(root, manifest) {
  if (!manifest) return { installed: false, healthy: false, files: [], message: 'Advisor kurulu değil. advisor init çalıştırın.' };
  const desired = desiredFiles(root);
  const files = MANAGED.map((name) => {
    const current = read(root, name);
    const record = manifest.files[name];
    const state = current === null ? 'missing' : hash(current) !== record.sha256 ? 'modified'
      : current !== desired[name] ? 'outdated' : 'ok';
    return { path: name, owned: record.owned, state };
  });
  const block = section(read(root, 'AGENTS.md'));
  files.push({ path: 'AGENTS.md (advisor)', state: !block ? 'missing'
    : hash(block.text) !== manifest.agents.sha256 ? 'modified'
      : block.text !== desiredSection() ? 'outdated' : 'ok' });
  return { installed: true, healthy: files.every((item) => item.state === 'ok') && manifest.version === version,
    installedVersion: manifest.version, availableVersion: version, files, context: detect(root) };
}

const HELP = `codex-advisor ${version}\n\nKullanım: advisor <init|status|update|remove> [--path <klasör>] [--dry-run] [--json]\n\n  init       Temel advisor skill ve ajanlarını projeye kurar (tekrarlanabilir).\n  status     Kurulumu, dosya değişikliklerini ve proje teknolojilerini gösterir.\n  update     Mevcut kurulumu bu CLI sürümündeki şablonlarla günceller.\n  remove     Yalnızca advisor tarafından eklenen dosyaları ve bölümü kaldırır.\n\nVarsayılan hedef Git kökü; Git dışında geçerli klasör. --path tam hedefi seçer.\n--dry-run dosya yazmadan değişiklikleri gösterir. --json yapılandırılmış çıktı verir.\n--help yardım, --version sürüm bilgisini gösterir.\n`;

export function run(args, cwd = process.cwd(), output = console.log) {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) { output(HELP); return 0; }
  if (args.length === 1 && args[0] === '--version') { output(version); return 0; }
  const command = args[0];
  if (!['init', 'status', 'update', 'remove'].includes(command)) throw new Error(`Bilinmeyen komut: ${command}`);
  let directory = cwd;
  let explicit = false;
  let dryRun = false;
  let asJson = false;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--path') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('--path bir klasör gerektirir.');
      directory = path.resolve(cwd, args[++i]); explicit = true;
    } else if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--json') asJson = true;
    else throw new Error(`Bilinmeyen seçenek: ${args[i]}`);
  }
  const root = projectRoot(directory, explicit);
  const manifest = loadManifest(root);
  if (command === 'status') {
    const result = { root, ...status(root, manifest) };
    output(asJson ? json(result).trimEnd() : [root, result.message ?? `Advisor ${result.installedVersion}`,
      ...(result.files.map((item) => `${item.state.padEnd(9)} ${item.path}${item.owned === false ? ' (mevcut dosya)' : ''}`)),
      ...(result.context ? [`Teknolojiler: ${[...result.context.technologies, ...result.context.frameworks].join(', ') || 'tespit edilemedi'}`] : []),
    ].join('\n'));
    return result.healthy ? 0 : 1;
  }
  if (command === 'update' && !manifest) throw new Error('Advisor kurulu değil. Önce advisor init çalıştırın.');
  if (command === 'remove' && !manifest) {
    output(asJson ? json({ root, command, changes: [], conflicts: [] }).trimEnd() : 'Advisor kurulu değil; değişiklik yapılmadı.');
    return 0;
  }
  const plan = command === 'remove' ? planRemove(root, manifest) : planInstall(root, manifest);
  const result = { root, command, dryRun, changes: plan.changes.map((item) => ({ path: item.path,
    action: item.after === null ? 'remove' : item.before === null ? 'create' : 'update' })),
  conflicts: plan.conflicts, ...(plan.context ? { context: plan.context } : {}) };
  if (!plan.conflicts.length && !dryRun && plan.changes.length) apply(root, plan);
  output(asJson ? json(result).trimEnd() : [root,
    ...(plan.conflicts.length ? ['Çakışma var; hiçbir dosya değiştirilmedi.', ...plan.conflicts,
      'Değişikliklerinizi yedekleyip çakışmayı giderdikten sonra tekrar çalıştırın.']
      : [dryRun ? 'Önizleme; dosyalar değiştirilmedi.' : 'İşlem tamamlandı.',
        ...result.changes.map((item) => `${item.action.padEnd(7)} ${item.path}`),
        ...(!result.changes.length ? ['Kurulum zaten güncel; değişiklik yok.'] : []),
        ...(plan.context ? [`Teknolojiler: ${[...plan.context.technologies, ...plan.context.frameworks].join(', ') || 'tespit edilemedi'}`,
          ...plan.context.warnings] : []),
        ...(command === 'init' ? ['Codex içinde $model-advisor ile kullanın. Görünmezse Codex oturumunu yeniden açın.'] : []),
      ]),
  ].join('\n'));
  return plan.conflicts.length ? 1 : 0;
}
