# Adaptive Model Routing

Read .github/skills/model-advisor/SKILL.md when planning development work.
Start normal development in a standard main session (Claude Sonnet 5.5);
standard-worker is the implementation agent and can be selected as the main agent.
The standard main session owns implementation and validation. Consult advisor
(Claude Opus 5.5) only for meaningful architectural decisions, uncertainty or risk.
Advisor returns analysis and recommendations without changing project files,
coordinating implementation or invoking workers. Integrate its advice, then
continue implementation and validation in the standard main session.
Use fast-worker (Claude Haiku 5.5) for simple isolated tasks and deep-expert
(Claude Opus 5.5) for difficult investigations when delegation is beneficial.
Keep short and routine work in the main session. Worker subagents return
uncertainty to the caller so it can consult advisor; do not create recursive
consultation chains. Invoke configured agents by exact name without per-call
model overrides. Use native delegation only when available.
Do not ask the user to choose an agent or model for every task. If delegation or
a configured model is unavailable, disclose the limitation and continue with the
current model when sufficient. Recommend a manual switch only if needed to finish
reliably. Do not silently substitute a model or claim delegation that did not occur.
Keep the main session model unchanged and respect requests only for advice or planning.
Validate changes with npm test and npm run check.
