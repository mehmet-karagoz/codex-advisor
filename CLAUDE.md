# Adaptive Model Routing

Read .claude/skills/model-advisor/SKILL.md when planning development work.
Use standard-worker (Claude Sonnet 5.5) for normal implementation, advisor
(Claude Opus 5.5) for high reasoning and planning, deep-expert (Claude Opus 5.5)
for difficult investigations, and fast-worker (Claude Haiku 5.5) for simple work.
Invoke configured agents without per-call model overrides to preserve pinned
model IDs. Delegate only when beneficial. Keep the main session model unchanged.
Validate changes with npm test and npm run check.
