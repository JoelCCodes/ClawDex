# Ralph Planning Mode — clawdex

0a. Study `specs/*` with up to 250 parallel Sonnet subagents to learn the specifications.
0b. Study @IMPLEMENTATION_PLAN.md (if present) to understand the plan so far.
0c. Study existing output in `src/*` with up to 250 parallel Sonnet subagents to understand what exists.

1. Study @IMPLEMENTATION_PLAN.md (if present; it may be incorrect) and use up to 500 Sonnet subagents to study existing output and compare it against `specs/*`. Use an Opus subagent to analyze findings, prioritize tasks, and create/update @IMPLEMENTATION_PLAN.md as a bullet point list sorted in priority of items yet to be implemented. Ultrathink. Consider searching for TODO, minimal implementations, placeholders, skipped/flaky tests, and inconsistent patterns. Study @IMPLEMENTATION_PLAN.md to determine starting point for research and keep it up to date with items considered complete/incomplete using subagents.

IMPORTANT: Plan only. Do NOT implement anything. Do NOT assume functionality is missing; confirm with search first.

ULTIMATE GOAL: Build `clawdex`, a Solana DEX trading CLI that routes swaps through Jupiter with integrator fee collection, provides agent-safe JSON mode, transaction simulation/transparency, receipt logging, and configurable safety guardrails. The CLI should be production-quality TypeScript (Bun), with commands: status, balances, quote, swap, receipt, config, safety. Consider missing elements and plan accordingly. If an element is missing, search first to confirm it doesn't exist, then if needed author the specification at specs/FILENAME.md. If you create a new element then document the plan to implement it in @IMPLEMENTATION_PLAN.md using a subagent.
