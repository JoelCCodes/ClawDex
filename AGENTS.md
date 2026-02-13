# Operational Guide — clawdex

## Build & Run

```bash
# Install dependencies
bun install

# Run CLI
bun run src/cli.ts status
bun run src/cli.ts quote --in SOL --out USDC --amount 1 --slippage-bps 50
bun run src/cli.ts swap --in SOL --out USDC --amount 1 --slippage-bps 50 --yes --json

# Build (if needed for distribution)
bun build src/cli.ts --outdir dist --target bun
```

## Validation

Run these after implementing to get immediate feedback:

```bash
# Tests
bun test

# Type checking
bun x tsc --noEmit

# Linting
bun x eslint src/
```

## Codebase Patterns

- CLI entry point: `src/cli.ts`
- Commands: `src/commands/*.ts` (one file per command)
- Core logic: `src/core/*.ts` (jupiter client, wallet, config, safety, receipts)
- Types: `src/types.ts` (shared type definitions)
- Config: TOML format at `~/.clawdex/config.toml`, parsed with `@iarna/toml`
- All HTTP calls to Jupiter API go through `src/core/jupiter.ts`
- Output formatting: `src/core/output.ts` (handles human vs JSON mode)
- Every command supports `--json` flag for agent mode

## Operational Notes

- Ralph will update this as it discovers things
