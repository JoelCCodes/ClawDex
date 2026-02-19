# AgentDex

Solana DEX trading CLI powered by Jupiter. Swap any token, with simulation, safety guardrails, and full JSON output.

- **Current version**: 0.4.0
- **Package**: `npm install -g agentdex-trade`
- **Config**: `~/.agentdex/config.toml`

## For agents using AgentDex

Install or upgrade:
```bash
npm install -g agentdex-trade@latest
```

All commands support `--json` for structured output. Agents must use `--json` and `--yes` flags.

Typical agent workflow:
```bash
agentdex status --json                                    # health check
agentdex balances --json                                  # check wallet
agentdex swap --in SOL --out USDC --amount 0.01 --simulate-only --json  # dry run
agentdex swap --in SOL --out USDC --amount 0.01 --yes --json            # execute
agentdex send --to <addr> --token SOL --amount 0.01 --yes --json        # transfer
```

See **EXAMPLES.md** for full CLI reference with expected outputs and JSON schemas.
See **AGENT.md** for integration guide (setup, error handling, safety).

## For agents developing AgentDex

```bash
bun run dev <command>       # run from source
bun test                    # 192 tests
bun x tsc --noEmit          # type check
```

### Key directories

- `src/commands/` — CLI command implementations
- `src/core/` — shared modules (config, wallet, tokens, jupiter, simulate, safety)
- `src/types.ts` — all TypeScript interfaces
- `src/constants.ts` — API URLs, known tokens, defaults
- `tests/` — mirrors `src/` structure

### Releasing

Before every `npm publish` or `/ship`:
1. Bump `version` in `package.json` (npm rejects re-publishing the same version)
2. Update `Current version` at the top of this file to match
3. Update the version check in `AGENT.md` (`should print X.Y.Z+`)

### Conventions

- All commands print human output by default, structured JSON with `--json`
- Exit codes: 0=success, 1=general, 2=config, 3=safety, 4=simulation, 5=send
- Token resolution: hardcoded SOL/USDC/USDT + Jupiter verified list (cached 1hr)
- Config layering: defaults < config file < env vars < CLI flags
- Non-interactive swaps and sends require `--yes`; `--simulate-only` does not
- Zero-balance tokens hidden in human output, included in JSON
