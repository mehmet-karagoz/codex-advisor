---
name: model-advisor
description: Evaluate coding task complexity and use a standard main session with on-demand stronger advice in Codex, GitHub Copilot or Claude Code. Use for development planning, implementation, debugging, architecture, refactoring and review.
---

# Adaptive Model Advisor

Before substantial work, evaluate complexity, uncertainty, risk and scope. The default is a standard main session that owns implementation and validation; a stronger model is an on-demand consultant. Keep the main session model unchanged. Read .advisor/context.json when present and verify its hints against the project.

## Host-specific routing

| Role | Codex agent / model / effort | Copilot and Claude Code agent / model / effort |
| --- | --- | --- |
| Default main session and normal implementation | gpt-6-sol / medium; standard_worker for delegated work | Claude Sonnet 5.5 / medium where supported; standard-worker for implementation |
| LOW: isolated searches, renames, small fixes | fast_worker / gpt-6-luna / low | fast-worker / Claude Haiku 5.5 / low where supported |
| On-demand advice: architecture, uncertainty, risk, planning tradeoffs | advisor / gpt-6.1-sol / high | advisor / Claude Opus 5.5 / high where supported |
| HIGH: difficult bugs, concurrency, multi-module investigations | deep_expert / gpt-6.1-sol / high | deep-expert / Claude Opus 5.5 / high where supported |
| CRITICAL: security, financial correctness, major architecture | advisor for advice, deep_expert for investigation / gpt-6.1-sol / xhigh if supported | advisor for advice, deep-expert for investigation / Claude Opus 5.5 / highest supported effort when justified |

Routine work stays in the standard main session. Consult advisor only when a meaningful decision, unresolved uncertainty or risk benefits from stronger reasoning. Advisor returns analysis and recommendations without changing project files, invoking workers or coordinating implementation. The standard main session integrates the advice, then continues implementation and validation. Do not consult a stronger model for every request or route ordinary implementation through advisor.

## Native integrations

- Codex: .codex/agents/*.toml and .agents/skills/model-advisor/SKILL.md. Start with gpt-6-sol / medium; advisor is a separate consultation agent. Installing files does not select the main model or change .codex/config.toml.
- GitHub Copilot CLI, VS Code and Visual Studio: .github/agents/*.agent.md and .github/copilot-instructions.md. Select standard-worker for the main conversation where supported. It consults advisor through available native tools when warranted and resumes implementation itself. Do not select advisor as the persistent coordinator. Worker calls use exact agent names without per-call model overrides.
- Claude Code: .claude/agents/*.md and CLAUDE.md. Start a normal session with Sonnet 5.5, or use standard-worker as the main agent where supported. The main session invokes advisor only when warranted. Invoke configured agents without per-call model overrides to preserve their pinned model IDs.

Use only the host's native agent tool when it is actually available. Never call another provider's CLI or API to simulate delegation. A model ID in one host does not configure another host. Effort is a preference only where supported; do not invent an editor setting to enforce it.

## Routing policy

1. Prefer the least expensive sufficient configuration. Keep short sequential work in the main session when delegation costs more than it saves. Do not spawn standard-worker just to duplicate work the standard main session can do directly.
2. Delegate only when it improves quality or efficiency. Give implementation workers explicit file ownership and responsibility; tell them to preserve other contributors' edits. Give advisor a focused question, relevant context and expected analysis with no project changes.
3. The main session decides whether consultation is needed. When running as a worker subagent, return uncertainty or risks to the caller so it can consult advisor; do not create recursive consultation chains. Advisor returns findings directly and does not delegate further.
4. Consult advisor when architectural choices matter, targeted investigation leaves uncertainty, attempted solutions fail, or cross-module/security risks warrant it. Use deep-expert for a focused difficult investigation. Do not repeatedly escalate without new evidence.
5. If delegation or a configured model is unavailable, disclose the limitation and continue with the current model when sufficient. Recommend an available alternative or manual switch only if current capabilities are insufficient to finish reliably. Never silently substitute a configured model version.
6. Do not ask the user to choose an agent or model for every task. Never claim to change the main model or to have used a different model unless execution actually occurred. Configuration does not prove account access.
7. Integrate delegated findings and validate the final change in the standard main session. Carry authorized implementation through completion; requests only for advice, review or a plan must remain within that scope. Normally keep complexity classification internal; briefly report actual delegation when it occurs.

These files guide native tools; they do not install extensions, grant model access, force the main chat model or enable unavailable agent features.
