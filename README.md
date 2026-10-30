<div align="center">

# codex-advisor

**A standard model for everyday work. A stronger advisor when it matters.**

Install native skills and agents for **Codex**, **GitHub Copilot**, and **Claude Code** with one CLI.

[![CI](https://github.com/mehmet-karagoz/codex-advisor/actions/workflows/ci.yml/badge.svg)](https://github.com/mehmet-karagoz/codex-advisor/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Dependencies](https://img.shields.io/badge/runtime_dependencies-0-blue)](package.json)
[![GitHub issues](https://img.shields.io/github/issues/mehmet-karagoz/codex-advisor)](https://github.com/mehmet-karagoz/codex-advisor/issues)

**English** · [Türkçe](README.tr.md)

[Quick start](#quick-start) · [How it works](#how-it-works) · [Commands](#commands) · [Contributing](CONTRIBUTING.md)

</div>

## Why codex-advisor?

Everyday development and difficult architectural decisions need different levels of reasoning.
`codex-advisor` installs a shared policy and four native agent roles so your main session can
handle implementation, consult a stronger advisor when needed, and finish validation itself.

- **Three tools, one policy:** Codex, Copilot CLI / VS Code / Visual Studio, and Claude Code.
- **Project or personal scope:** share a setup with your team or install agents for your own projects.
- **Preview before writing:** inspect changes with `--dry-run` and structured output with `--json`.
- **Protect existing files:** detect conflicts, preserve unrelated instructions, and track file ownership.
- **Keep it local:** no runtime npm dependencies, API keys, AI requests, or model access checks in the CLI.

Your AI client still needs its own account, subscription, and access to the configured models.
The CLI installs configuration; the host's native agent tools carry out any delegation.

## Quick start

Requires **Node.js 20+**, npm, and Git to clone the repository.

```bash
git clone https://github.com/mehmet-karagoz/codex-advisor.git
cd codex-advisor
npm install -g .
```

Then, in the project where you want to use the agents:

```bash
cd /path/to/your-project

# Preview the files for your tool
advisor init --target codex --dry-run

# Install and inspect
advisor init --target codex
advisor status
```

Choose the target that matches your workflow:

```bash
advisor init --target codex
advisor init --target copilot
advisor init --target claude

# Or install all three
advisor init --target all
```

Open a new AI session after installation. Start with the standard model or `standard-worker`
agent described below, then give it your development task.

> With no `--target`, a fresh installation selects **Codex**. Later commands remember the
> installed targets. Adding a target with `init` preserves the other targets.

The package is distributed through this GitHub repository. It is **not published to npm**;
`private: true` prevents accidental npm publication.

### Run without a global npm installation

```bash
node /path/to/codex-advisor/bin/advisor.js init --target copilot --path /path/to/your-project
```

By default, the CLI finds the nearest Git root, including worktrees. Outside Git, it uses the
current directory. `--path` targets an existing directory explicitly. Quote paths containing spaces.

## How it works

```text
Your development task
        |
        v
Standard main session ── implementation and validation
        |
        +── routine work ──────────── handle directly
        +── architecture / risk ───── consult advisor, then continue
        +── simple isolated task ──── fast-worker when useful
        +── difficult investigation ─ deep-expert when useful
```

The main session owns the result. `advisor` provides analysis and recommendations; it does not
edit project files, invoke workers, or become a persistent coordinator. Short tasks stay in the
main session when delegation would add overhead. Workers return uncertainty to their caller.

### Bundled model profiles

These are the preferences shipped in the current templates, subject to your host and account's
model availability. Installing the files does not change the main conversation's model.

| Role | Codex agent / model | Copilot & Claude Code agent / model | Reasoning preference |
| --- | --- | --- | --- |
| Small, isolated tasks | `fast_worker` / `gpt-6-luna` | `fast-worker` / Claude Haiku 5.5 | low |
| Implementation and validation | `standard_worker` / `gpt-6-sol` | `standard-worker` / Claude Sonnet 5.5 | medium |
| Architecture, uncertainty, risk | `advisor` / `gpt-6.1-sol` | `advisor` / Claude Opus 5.5 | high |
| Difficult investigations | `deep_expert` / `gpt-6.1-sol` | `deep-expert` / Claude Opus 5.5 | high |

Claude Code templates pin `claude-haiku-5-5`, `claude-sonnet-5-5`, and `claude-opus-5-5`,
with explicit `effort` fields. Copilot templates specify model names and use the reasoning
controls supported by the client. Codex recommends higher effort for exceptional difficulty
when supported. Review the [templates](templates) before installing if you need different preferences.

### Start in your AI tool

| Tool | After `advisor init --target …` |
| --- | --- |
| Codex | Start a normal `gpt-6-sol` / medium session. Invoke `$model-advisor` explicitly if needed; `AGENTS.md` also directs the agent to read it. |
| Copilot CLI | Start with `copilot --agent=standard-worker`, or choose it with `/agent`. |
| VS Code / Visual Studio | Select **standard-worker** in the Copilot Chat agent picker. |
| Claude Code | Start a normal Sonnet 5.5 session or `claude --agent standard-worker`. `/model-advisor` loads the policy; `/agents` lists agents. |

Native subagent availability differs by client. Visual Studio custom agents require **18.4+**;
custom agent support alone does not establish automatic subagent support. If a configured model
or delegation tool is unavailable, the policy asks the agent to explain the limitation and
continue when capable. Automatic delegation and model switching are not guaranteed.

For client-specific details and upstream documentation, see the
[full usage guide](README.tr.md#github-copilot-cli-vs-code-ve-visual-studio).

## Commands

| Command | Behavior |
| --- | --- |
| `advisor init --target <tool>` | Install or add a target; repeated runs are idempotent. |
| `advisor status` | Report installed targets, file health, and detected project technologies. |
| `advisor update` | Refresh installed targets from the templates bundled with this CLI. |
| `advisor remove` | Remove all installed targets, or only the target selected with `--target`. |

| Option | Meaning |
| --- | --- |
| `--target codex\|copilot\|claude\|all` | Select tools; `update` only updates those already installed. |
| `--path <directory>` | Use an explicit project directory. |
| `--global` | Manage personal configuration instead of project files. |
| `--dry-run` | Preview a mutation without writing files. |
| `--json` | Emit structured output. |
| `--help` / `--version` | Show CLI help or version. |

Exit codes: `0` for success, `1` for errors or conflicts. `status` also returns `1` when the
installation is missing or needs attention. Errors go to stderr. CLI messages are currently Turkish.

### Update and remove

Update your local CLI checkout first, then refresh each installed scope:

```bash
# In the codex-advisor checkout
git pull --ff-only
npm install -g .

# In your target project
advisor update --dry-run
advisor update

# Manage a single tool
advisor status --target copilot
advisor remove --target claude
```

`advisor update` does not download a new CLI or install new targets. Use `init --target <tool>`
to add a tool. Older manifests migrate while preserving ownership; see the
[migration notes](README.tr.md#komutlar-ve-güncelleme).

### Personal installation

```bash
advisor init --global --target all --dry-run
advisor init --global --target all
advisor status --global
advisor update --global
advisor remove --global --target copilot
```

| Tool | Agents | Skill | Instructions |
| --- | --- | --- | --- |
| Codex | `~/.codex/agents/` | `~/.agents/skills/model-advisor/` | `~/.codex/AGENTS.md` |
| Copilot CLI | `~/.copilot/agents/` | `~/.copilot/skills/model-advisor/` | `~/.copilot/copilot-instructions.md` |
| Claude Code | `~/.claude/agents/` | `~/.claude/skills/model-advisor/` | `~/.claude/CLAUDE.md` |

Global Copilot installation targets **Copilot CLI**. Use project installation for VS Code and
Visual Studio. Personal state lives in `~/.advisor/global/`; global installation neither scans
your home for project context nor writes to the current project.

Use `--global` on every command that manages personal scope. It cannot be combined with
`--path`. Redirected configuration roots through `CODEX_HOME`, `COPILOT_HOME`, or
`CLAUDE_CONFIG_DIR` are currently rejected for the affected global target.

Project and personal installations have independent lifecycles. If both define the same agent,
the client determines precedence. Keep both scopes updated and reopen the AI session.

## Files added to a project

With `--target all`:

```text
.agents/skills/model-advisor/SKILL.md
.codex/agents/{advisor,fast-worker,standard-worker,deep-expert}.toml
.github/skills/model-advisor/SKILL.md
.github/agents/{advisor,fast-worker,standard-worker,deep-expert}.agent.md
.claude/skills/model-advisor/SKILL.md
.claude/agents/{advisor,fast-worker,standard-worker,deep-expert}.md
.advisor/context.json
.advisor/manifest.json
AGENTS.md                         # marked advisor section
.github/copilot-instructions.md    # marked advisor section
CLAUDE.md                         # marked advisor section
```

A single target creates only its own files and the shared `.advisor/` state. Context detection
reads common root-level technology markers, JavaScript frameworks, and validation scripts;
it does not execute those scripts. Use `--path` for a monorepo subproject. Keep generated
files, context, and manifest together in version control for team installations.

### Existing file protection

- Conflicting skill or agent content stops the whole operation before applying changes.
- Identical existing files are borrowed and survive removal.
- Edited managed files or instruction sections block updates and removal.
- Instructions outside the marked advisor section and unrelated provider settings are preserved.
- Managed paths reject symbolic links; a lock prevents concurrent mutations.
- Removing one target preserves other targets; shared state is removed with the final target.

Do not edit the manifest by hand. Back up intentional edits to managed files before restoring
the installed content to resolve a conflict. See the [full guide](README.tr.md#mevcut-dosyaların-korunması).

## Development

```bash
npm test
npm run check
```

Tests use Node's built-in runner and temporary directories. They cover project and global
lifecycles, file ownership, conflict handling, symlinks, locks, target isolation, and migrations.
GitHub Actions runs these checks on Linux with Node.js 20, 22, and 24.

```text
bin/advisor.js      CLI entry point
src/advisor.js      Installation, detection, ownership, and lifecycle logic
templates/         Distributed skills and native agent definitions
test/              Project and personal installation tests
```

The root `.agents/`, `.codex/`, `.github/`, and `.claude/` agent files configure development of
this repository. The files under `templates/` are the ones installed into other projects.

## Contributing

Bug reports, documentation improvements, and focused pull requests are welcome.
Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup and validation. Use the
[issue templates](https://github.com/mehmet-karagoz/codex-advisor/issues/new/choose)
to report reproducible problems or propose a feature.

## Author & support

Created by [Mehmet Karagöz](https://github.com/mehmet-karagoz).
If this tool helps your workflow, you can [buy me a coffee](https://www.buymeacoffee.com/mehmetkaragozdev).

## License

[MIT](LICENSE) © 2026 Mehmet Karagoz.
