# Contributing to codex-advisor

Thanks for helping improve the project. Small, focused changes are easiest to review.

## Setup

Install Node.js 20+ and Git, fork the repository, then clone your fork:

```bash
git clone https://github.com/YOUR-USERNAME/codex-advisor.git
cd codex-advisor
git checkout -b fix/describe-your-change
node bin/advisor.js --help
```

The CLI and test suite have no npm dependencies. A global installation is optional.

## Making changes

- Change distributed skills and agent profiles under `templates/`. Root-level agent files configure this repository's own development environment.
- Preserve target isolation, project/global scope separation, and existing user content.
- Keep model preferences consistent across affected profiles and documentation. Describe any host-specific limitation explicitly.
- Update both [English](README.md) and [Turkish](README.tr.md) usage documentation when behavior changes.
- Add regression coverage for behavior changes, particularly file ownership, conflicts, and removal.

Try installation in a disposable directory with an explicit `--path`; preview with `--dry-run` first. For global behavior, follow the test suite's isolated home-directory fixtures rather than changing your personal setup.

## Validation

```bash
npm test
npm run check
```

CI runs these commands on Linux with Node.js 20, 22, and 24. Include the commands you ran and their results in your pull request. If a change affects a particular AI client, state which client and version you checked.

## Issues and pull requests

Search existing issues before opening a new one. For bugs, include your operating system, Node.js version, CLI version, target, scope, exact command, and a minimal reproduction. Remove private paths, project data, and credentials from logs.

Open a pull request against `main` with the problem, resulting behavior, and validation results. Avoid unrelated formatting or generated configuration changes.

Contributions are distributed under this repository's [MIT License](LICENSE).
