# Adaptive Model Routing

Read .github/skills/model-advisor/SKILL.md when planning development work.
Select advisor (Claude Opus 5.5) once as the persistent coordinator. It handles
planning and automatically invokes standard-worker (Claude Sonnet 5.5) for normal
implementation, deep-expert (Claude Opus 5.5) for difficult investigations, and
fast-worker (Claude Haiku 5.5) for simple work when native delegation is available
and beneficial. Use exact agent names without per-call model overrides. Workers
return findings to the coordinator instead of recursively invoking advisor.
Do not ask the user to choose an agent or model for every task. If native
delegation or a worker model is unavailable, disclose the limitation and complete
authorized work in advisor with the current model when sufficient. Recommend a
manual switch only if current capabilities are insufficient. Keep the main
session model unchanged and respect requests only for advice or planning.
Validate changes with npm test and npm run check.
