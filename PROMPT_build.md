# Ralph Build Mode — clawdex

## Context Loading

0a. Study `specs/*` with up to 500 parallel Sonnet subagents to learn the specifications.
0b. Study @IMPLEMENTATION_PLAN.md.
0c. For reference, the output location is `src/*`. The CLI entry point is `src/cli.ts`.

## Your Job: ONE Atomic Task Per Iteration

1. Pick the **single highest-priority unchecked item** from @IMPLEMENTATION_PLAN.md. Do NOT try to do multiple items — pick ONE, finish it completely, commit, and stop. The loop will re-invoke you with fresh context for the next item.
2. Before making changes, search the codebase (don't assume not implemented) using Sonnet subagents. You may use up to 500 parallel Sonnet subagents for searches/reads and only 1 Sonnet subagent for build/tests. Use Opus subagents when complex reasoning is needed (debugging, architectural decisions).
3. Implement the item fully. No placeholders, no stubs. Ultrathink.
4. After implementing, run validation (see @AGENTS.md for commands). Fix any failures before committing.
5. Mark the item as done (`[x]`) in @IMPLEMENTATION_PLAN.md using a subagent.
6. `git add -A && git commit` with a message describing what you built.
7. **STOP.** Do not pick up another item. Exit cleanly so the loop gives the next iteration fresh context.

## Completion Check

After committing, check @IMPLEMENTATION_PLAN.md. If **every item is `[x]` checked** and all tests/validation pass and the CLI runs correctly (`bun run src/cli.ts status`), then create the file `.ralph-complete` with a short summary of what was built. This signals the loop to stop.

## Rules

- ONE task per iteration. Finish it, commit it, get out.
- When you discover issues, update @IMPLEMENTATION_PLAN.md with findings using a subagent. If the issue is in your current item, fix it now. If not, document it and move on.
- Single sources of truth, no migrations/adapters. If tests unrelated to your work fail, resolve them as part of the increment.
- As soon as there are no build or test errors create a git tag. If there are no git tags start at 0.0.0 and increment patch by 1.
- Keep @IMPLEMENTATION_PLAN.md current with learnings using a subagent — future work depends on this to avoid duplicating efforts.
- When you learn something new about how to run the project, update @AGENTS.md using a subagent but keep it brief.
- For any bugs you notice, resolve them or document them in @IMPLEMENTATION_PLAN.md using a subagent even if unrelated to the current piece of work.
- Implement functionality completely. Placeholders and stubs waste efforts and time redoing the same work.
- If you find inconsistencies in the specs/* then use an Opus subagent with 'ultrathink' to update the specs.
- IMPORTANT: Keep @AGENTS.md operational only — status updates and progress notes belong in `IMPLEMENTATION_PLAN.md`. A bloated AGENTS.md pollutes every future loop's context.

## Project-Specific Notes

- This is a TypeScript project using Bun runtime.
- CLI framework: use `commander` for argument parsing.
- Config format: TOML (`~/.clawdex/config.toml`).
- Primary integration: Jupiter Swap API for routing + fee collection.
- All swap commands must attach integrator fee params (`platformFeeBps`, `feeAccount`).
- Transaction safety: always simulate before broadcast, show instruction-level transfer diff.
- Two output modes: human-readable (default) and `--json` for agents.
- Security is paramount: validate all addresses, enforce allowlists, fail closed on unknown transfers.
