---
name: model-advisor
description: Automatically evaluate coding task complexity and route suitable tasks to cost-efficient or stronger Codex subagents with appropriate model and reasoning effort. Use for software development, debugging, architecture, refactoring, and code review.
---

# Adaptive Model Advisor

## Objective

Optimize model selection and reasoning effort for coding tasks.

Keep the main session model unchanged. The model preferences below apply only when available in the current environment.

Do not assume all tasks require the strongest model.

## Complexity Classification

Before significant work, classify the task internally.

### LOW
Examples:
- Renaming variables or methods
- Simple DTO updates
- Searching files
- Straightforward syntax fixes

Preferred:
- Model: gpt-6-luna
- Effort: low

### MEDIUM
Examples:
- Normal feature development
- Unit tests
- Localized refactoring
- Well-understood bug fixes

Preferred:
- Model: gpt-6-sol
- Effort: medium

### HIGH
Examples:
- Complex debugging
- Multi-module refactoring
- Database performance tuning
- Concurrency and async problems
- Distributed system behavior

Preferred:
- Model: gpt-6.1-sol
- Effort: high

### CRITICAL
Examples:
- Security-sensitive authentication flows
- Complex payment and settlement logic
- Race conditions affecting financial correctness
- Major architecture decisions
- Difficult production incidents

Preferred:
- Model: gpt-6.1-sol
- Effort: xhigh, if supported

## Routing Policy

1. Evaluate complexity, uncertainty, risk, and affected scope.
2. Prefer the cheapest sufficient configuration.
3. Keep short, sequential tasks in the main agent when delegation overhead exceeds its benefit.
4. For independent substantial work, delegate to an appropriate configured subagent.
5. Do not claim to have changed the main session model.
6. Do not claim that a different model was used unless delegation actually happened.
7. If the desired model or effort is unavailable, use the best supported alternative or recommend a manual switch.
8. Escalate when evidence shows the current approach is insufficient.
9. Do not repeatedly escalate without new evidence.
10. Return delegated findings to the main agent for integration.

## Escalation Signals

Escalate when:
- Multiple attempted solutions fail.
- Root cause remains uncertain after targeted investigation.
- Cross-module dependencies introduce substantial risk.
- Security or financial correctness requires deeper validation.
- A performance optimization requires complex tradeoffs.

## Efficiency Rules

- Avoid unnecessary agents and duplicate investigations.
- Avoid expensive models for trivial operations.
- Never delegate solely to make a task appear more sophisticated.
- Do not interrupt an otherwise successful task to change models.
- Use stronger agents when quality improvement justifies the overhead.

## Reporting

Normally do not report complexity classification.

When delegation happens, briefly state which agent handled the task.

When automatic delegation is impossible, mention the recommended model and effort only if it would materially improve the outcome.
