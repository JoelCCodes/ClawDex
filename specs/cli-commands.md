# CLI Commands

## Overview

The `clawdex` CLI provides commands for quoting, swapping, and managing configuration for Solana DEX trading via Jupiter aggregator.

## Commands

### `clawdex status`

Health check command. Verifies:
- RPC endpoint connectivity and latency
- Token list availability
- Fee account configuration (warns if missing)
- Wallet configuration

Output (human): status summary with green/red indicators.
Output (JSON): `{ "rpc": { "url": "...", "healthy": true, "latency_ms": 42 }, "wallet": { "configured": true, "pubkey": "..." }, "fee_account": { "configured": true, "pubkey": "..." }, "token_list": { "loaded": true, "count": 1234 } }`

### `clawdex balances [--wallet <path>]`

Show SOL and token balances for the configured (or specified) wallet.

Options:
- `--wallet <path>` - Override wallet keypair path
- `--json` - Machine-readable output

Output (JSON): `{ "wallet": "...", "sol": "1.234", "tokens": [{ "mint": "...", "symbol": "USDC", "amount": "100.00", "decimals": 6 }] }`

### `clawdex quote`

Get a swap quote without executing.

Required flags:
- `--in <SYMBOL|MINT>` - Input token (e.g., SOL, USDC, or mint address)
- `--out <SYMBOL|MINT>` - Output token
- `--amount <NUMBER>` - Amount of input token

Optional flags:
- `--slippage-bps <NUMBER>` - Slippage tolerance in basis points (default: 50)
- `--fee-bps <NUMBER>` - Integrator fee in basis points (default: from config)
- `--json` - Machine-readable output

Output (JSON):
```json
{
  "input": { "mint": "So11...1112", "symbol": "SOL", "amount": "1.0" },
  "output": { "mint": "EPjF...4Mhj", "symbol": "USDC", "amount": "148.23", "min_amount": "147.49" },
  "price_impact_bps": 1,
  "slippage_bps": 50,
  "route": [{ "venue": "Raydium", "percent": 80 }, { "venue": "Orca", "percent": 20 }],
  "fees": {
    "network_fee_sol": "0.000005",
    "integrator_fee_bps": 20,
    "integrator_fee_amount": "0.0296",
    "integrator_fee_token": "USDC"
  }
}
```

### `clawdex swap`

Execute a swap. Builds, simulates, displays summary, then signs/sends.

Required flags:
- `--in <SYMBOL|MINT>` - Input token
- `--out <SYMBOL|MINT>` - Output token
- `--amount <NUMBER>` - Amount of input token

Optional flags:
- `--slippage-bps <NUMBER>` - Slippage tolerance (default: 50)
- `--fee-bps <NUMBER>` - Integrator fee (default: from config)
- `--yes` - Skip confirmation prompt (required for agent mode)
- `--json` - Machine-readable output
- `--simulate-only` - Simulate but don't broadcast
- `--skip-simulation` - Skip simulation before broadcast (dangerous, use with caution)

Behavior:
1. Get quote from Jupiter
2. Build swap transaction with fee params
3. Simulate transaction
4. Display instruction-level transfer summary (human mode) or include in JSON
5. If `--yes` not set, prompt for confirmation
6. Sign and send transaction
7. Wait for confirmation
8. Store receipt locally
9. Output result

Safety checks (fail closed):
- Reject if any transfer goes to unknown address
- Reject if fee exceeds configured maximum
- Reject if slippage exceeds configured maximum
- Reject if price impact exceeds configured maximum
- Reject if output mint not in allowlist (if allowlist configured)

Output (JSON):
```json
{
  "success": true,
  "signature": "5Kj7...",
  "input": { "mint": "...", "symbol": "SOL", "amount": "1.0" },
  "output": { "mint": "...", "symbol": "USDC", "amount": "148.20" },
  "fees": { "integrator_fee_bps": 20, "integrator_fee_amount": "0.0296" },
  "route": [...],
  "block_time": 1234567890,
  "slot": 123456789
}
```

Error output (JSON):
```json
{
  "success": false,
  "error": "SLIPPAGE_EXCEEDED",
  "message": "Price impact 250bps exceeds maximum 100bps",
  "details": {}
}
```

Exit codes:
- 0: Success
- 1: General error
- 2: Safety check failed
- 3: Transaction simulation failed
- 4: Transaction send/confirm failed
- 5: Configuration error

### `clawdex receipt <txsig>`

Look up a stored receipt by transaction signature.

Output: the stored receipt JSON, or error if not found.

### `clawdex config set <key=value> [key=value ...]`

Set configuration values. Writes to `~/.clawdex/config.toml`.

Keys:
- `rpc` - RPC endpoint URL
- `fee_bps` - Default integrator fee in basis points
- `fee_account` - Integrator fee account public key
- `wallet` - Path to wallet keypair file
- `receipts_dir` - Directory for receipt storage (default: `~/.clawdex/receipts/`)

### `clawdex safety set <key=value> [key=value ...]`

Set safety guardrail values. Writes to `~/.clawdex/config.toml` under `[safety]`.

Keys:
- `max_fee_bps` - Maximum allowed integrator fee
- `max_slippage_bps` - Maximum allowed slippage tolerance
- `max_price_impact_bps` - Maximum allowed price impact
- `max_trade_sol` - Maximum trade size in SOL equivalent
- `allowlist` - Comma-separated list of allowed output mints/symbols
- `rpc_allowlist` - Comma-separated list of approved RPC endpoints

## Acceptance Criteria

- [ ] All commands parse arguments correctly via commander
- [ ] `--json` flag produces stable, parseable JSON on stdout (errors on stderr)
- [ ] `--yes` flag suppresses all interactive prompts
- [ ] Exit codes are consistent and documented
- [ ] Unknown flags produce helpful error messages
- [ ] `--help` works for every command and subcommand
