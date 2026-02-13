# Project Setup & Structure

## Overview

TypeScript project using Bun runtime. Minimal dependencies, pinned versions.

## Directory Structure

```
src/
  cli.ts              # Entry point, commander setup, command registration
  commands/
    status.ts         # Status/health check command
    balances.ts       # Balance display command
    quote.ts          # Quote command
    swap.ts           # Swap command
    receipt.ts        # Receipt lookup command
    config.ts         # Config management command
    safety.ts         # Safety settings command
  core/
    jupiter.ts        # Jupiter API client (quote, swap, token list)
    wallet.ts         # Wallet loading and signing
    config.ts         # Config file parsing and management
    safety.ts         # Safety rule validation
    receipts.ts       # Receipt storage and retrieval
    output.ts         # Output formatting (human vs JSON)
    tokens.ts         # Token resolution (symbol -> mint)
    simulate.ts       # Transaction simulation and transfer diff
  types.ts            # Shared type definitions
  constants.ts        # Known program IDs, default config, token mints
tests/
  commands/           # Command-level tests
  core/               # Core module tests
  fixtures/           # Test fixtures (mock responses, keypairs)
```

## Dependencies (minimal)

```json
{
  "dependencies": {
    "@solana/web3.js": "^1.98",
    "@solana/spl-token": "^0.4",
    "commander": "^13",
    "@iarna/toml": "^2.2",
    "chalk": "^5"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "@types/bun": "latest",
    "eslint": "^9",
    "@typescript-eslint/eslint-plugin": "^8",
    "@typescript-eslint/parser": "^8"
  }
}
```

## TypeScript Config

- Target: ESNext
- Module: ESNext
- ModuleResolution: bundler
- Strict mode: true
- Output dir: dist/

## Bun Setup

- Entry: `src/cli.ts`
- Test: `bun test` (uses built-in test runner)
- Binary name: `clawdex` (via `bin` field in package.json or bun build)

## Requirements

- [ ] `bun install` succeeds
- [ ] `bun run src/cli.ts --help` shows available commands
- [ ] `bun test` runs and passes
- [ ] `bun x tsc --noEmit` passes type checking
- [ ] Project structure matches the directory layout above
