## Adaptive Model Routing

Use the model-advisor skill when planning development work.
Evaluate complexity before substantial execution.

Start normal development in a standard main session (gpt-6-sol / medium).
Keep the main session model unchanged; do not force a model switch.
The standard main session owns implementation and validation.

Use advisor (gpt-6.1-sol / high) only for meaningful architectural decisions,
unresolved uncertainty or risk. Advisor returns analysis and recommendations
without changing project files, coordinating implementation or invoking workers.
Integrate its advice, then continue implementation and validation in the main session.
Use fast_worker for simple isolated tasks, standard_worker for independent normal
implementation tasks, and deep_expert for difficult investigations when delegation
improves efficiency or quality. Keep short and routine work in the main session.
When running as a worker subagent, return uncertainty to the caller so it can
consult advisor; do not create recursive consultation chains.

Do not ask the user to select a model for every task. Use native delegation only
when available. If a configured model or delegation is unavailable, disclose the
limitation and continue with the current model when sufficient. Recommend a manual
switch only when needed to finish reliably. Do not silently substitute a model.
For exceptionally difficult tasks, prefer supported higher reasoning effort.
Validate changes with npm test and npm run check.
