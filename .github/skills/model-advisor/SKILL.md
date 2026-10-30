---
name: model-advisor
description: Evaluate coding task complexity and select suitable native agents for Codex, GitHub Copilot or Claude Code. Use for development planning, implementation, debugging, architecture, refactoring and review.
---

# Adaptive Model Advisor

Before substantial work, evaluate complexity, uncertainty, risk and scope. Keep the main session model unchanged. Read .advisor/context.json when present and verify its hints against the project.

## Host-specific routing

| Complexity | Codex agent / model / effort | Copilot and Claude Code agent / model / effort |
| --- | --- | --- |
| LOW: isolated searches, renames, small fixes | fast_worker / gpt-6-luna / low | fast-worker / Claude Haiku 5.5 / low |
| MEDIUM: normal features, tests, localized refactoring | standard_worker / gpt-6-sol / medium | standard-worker / Claude Sonnet 5.5 / medium |
| HIGH: difficult bugs, concurrency, multi-module changes | deep_expert / gpt-6.1-sol / high | deep-expert / Claude Opus 5.5 / high |
| CRITICAL: security, financial correctness, major architecture | deep_expert / gpt-6.1-sol / xhigh if supported | advisor for planning, deep-expert for investigation / Claude Opus 5.5 / highest supported effort when justified |

For Copilot and Claude Code, advisor uses Opus for high reasoning advice and planning; standard-worker uses Sonnet 5.5 for implementation. Use Haiku for well-specified low complexity work. Effort is a preference only where supported; do not invent an editor setting to enforce it.

## Native integrations

- Codex: .codex/agents/*.toml and .agents/skills/model-advisor/SKILL.md.
- GitHub Copilot in VS Code and Visual Studio: .github/agents/*.agent.md and .github/copilot-instructions.md. Select advisor, standard-worker, fast-worker or deep-expert in the agent picker when automatic delegation is unavailable.
- Claude Code: .claude/agents/*.md and CLAUDE.md. Invoke configured agents without per-call model overrides to preserve their pinned model IDs.

Use only the host's native agent tool when it is actually available. Never call another provider's CLI or API to simulate delegation. A model ID in one host does not configure another host.

## Routing policy

1. Prefer the least expensive sufficient configuration. Keep short sequential work in the main session when delegation costs more than it saves.
2. Delegate only when it improves quality or efficiency. Give each worker explicit file ownership and responsibility; tell it to preserve other contributors' edits.
3. Use advisor for high reasoning advice when a meaningful planning decision needs it, not for every trivial request.
4. Escalate when targeted investigation leaves uncertainty, attempted solutions fail, or cross-module/security risks warrant it. Do not repeatedly escalate without new evidence.
5. Use only available models and effort levels. If unavailable, disclose the limitation and recommend an available alternative or manual agent/model selection. Never silently substitute another version for Sonnet 5.5.
6. Never claim to change the main model or to have used a different model unless execution actually occurred. Configuration does not prove account access.
7. Integrate delegated findings and validate the final change. Normally keep complexity classification internal; briefly report actual delegation when it occurs.

These files guide native tools; they do not install extensions, grant model access, force the main chat model or enable unavailable agent features.
