# ClawDex

<p align="center">
  <video src="https://github.com/JoelCCodes/ClawDex/raw/main/assets/clawdex-demo.mp4" width="800" autoplay loop muted playsinline></video>
</p>

Solana DEX trading from the command line. Swap any token through [Jupiter](https://jup.ag), with transaction simulation, safety guardrails, and full JSON output for agent/bot integration.

```bash
npm install -g clawdex
clawdex onboarding          # interactive setup — done in 30 seconds
clawdex swap --in SOL --out USDC --amount 1
```

---

## Table of Contents

- [Quick Start](#quick-start)
- [Agent Quick Start](#agent-quick-start)
- [Commands](#commands)
- [JSON API Reference](#json-api-reference)
- [Configuration](#configuration)
- [Safety Guardrails](#safety-guardrails)
- [Integrator Fees](#integrator-fees)
- [Exit Codes](#exit-codes)
- [Development](#development)

---

## Quick Start

### 1. Install

```bash
npm install -g clawdex
```

Or run without installing: `npx clawdex <command>`

### 2. Set up

```bash
clawdex onboarding
```

This walks you through 4 steps: Jupiter API key, RPC endpoint, wallet, and safety limits. It auto-detects existing config, env vars, and Solana CLI wallets. You'll need a free Jupiter API key from **[portal.jup.ag/api-keys](https://portal.jup.ag/api-keys)**.

Don't have a Solana wallet? The onboarding will generate one for you.

### 3. Trade

```bash
clawdex quote --in SOL --out USDC --amount 1           # preview
clawdex swap  --in SOL --out USDC --amount 1            # execute
```

---

## Agent Quick Start

Everything works non-interactively with `--json`. Zero prompts, structured output, deterministic exit codes.

### Setup (one command)

```bash
clawdex onboarding \
  --jupiter-api-key "$JUPITER_API_KEY" \
  --rpc "$RPC_URL" \
  --generate-wallet \
  --json
```

This creates `~/.clawdex/config.toml` and a new wallet at `~/.clawdex/wallet.json`. To use an existing wallet, replace `--generate-wallet` with `--wallet /path/to/keypair.json`.

### Trading

```bash
# Get a quote
clawdex quote --in SOL --out USDC --amount 1 --json

# Execute a swap (--yes skips confirmation)
clawdex swap --in SOL --out USDC --amount 1 --yes --json

# Check balances
clawdex balances --json

# Look up a receipt
clawdex receipt <tx-signature> --json
```

### Error handling

Every command returns JSON on both stdout (result) and stderr (errors). Match on `exit code` + the `error` field:

| Exit Code | Meaning | Retryable? |
|-----------|---------|------------|
| 0 | Success | - |
| 1 | General error | Maybe |
| 2 | Safety check failed | No (fix params) |
| 3 | Simulation failed | Maybe (stale quote) |
| 4 | Send/confirm failed | Maybe (retry) |
| 5 | Configuration error | No (fix config) |

```json
{"error": "Safety check failed: slippage exceeds 500 bps", "code": 2}
```

### Non-TTY behavior

When stdin is not a TTY (piped, CI, agent):
- Commands that would prompt instead fail with exit 5 and list the missing flags
- `clawdex swap` requires `--yes` to execute (no confirmation prompt available)
- All output is `--json`-compatible even without the flag for error cases

---

## Commands

### `clawdex onboarding`

One-command setup. Configures everything ClawDex needs to run.

```bash
# Interactive — prompts for each value with sensible defaults
clawdex onboarding

# Non-interactive with existing wallet
clawdex onboarding \
  --jupiter-api-key KEY \
  --rpc https://api.mainnet-beta.solana.com \
  --wallet ~/.config/solana/id.json \
  --json

# Non-interactive with wallet generation + safety limits
clawdex onboarding \
  --jupiter-api-key KEY \
  --rpc https://api.mainnet-beta.solana.com \
  --generate-wallet \
  --max-slippage-bps 300 \
  --max-trade-sol 10 \
  --json
```

| Flag | Description |
|------|-------------|
| `--jupiter-api-key <key>` | Jupiter API key (required in non-interactive) |
| `--rpc <url>` | Solana RPC endpoint (required in non-interactive) |
| `--wallet <path>` | Path to existing keypair JSON |
| `--generate-wallet` | Generate a new wallet instead |
| `--wallet-output <path>` | Where to save generated wallet (default: `~/.clawdex/wallet.json`) |
| `--fee-bps <n>` | Platform fee in basis points (default: 20) |
| `--fee-account <pubkey>` | Fee collection wallet |
| `--max-slippage-bps <n>` | Max slippage guardrail |
| `--max-trade-sol <n>` | Max trade size guardrail |
| `--max-price-impact-bps <n>` | Max price impact guardrail |
| `--json` | JSON output |

Validates all three required values (API key, RPC, wallet) before writing config. Validation continues past the first failure so you see all problems at once.

---

### `clawdex wallet`

View wallet info or generate a new keypair.

```bash
clawdex wallet                                  # show pubkey, path, SOL balance
clawdex wallet --json                           # same, as JSON
clawdex wallet generate                         # create new keypair
clawdex wallet generate --output ~/my-wallet.json --json
```

Generate will never overwrite an existing file. Keypair files are written with `0600` permissions (owner-only read/write).

---

### `clawdex swap`

Execute a token swap through Jupiter.

```bash
clawdex swap --in SOL --out USDC --amount 1 --slippage-bps 50
clawdex swap --in SOL --out USDC --amount 1 --yes --json          # agent mode
clawdex swap --in SOL --out USDC --amount 1 --simulate-only       # dry run
```

| Flag | Description |
|------|-------------|
| `--in <token>` | Input token (symbol or mint address) |
| `--out <token>` | Output token (symbol or mint address) |
| `--amount <n>` | Amount of input token |
| `--slippage-bps <n>` | Slippage tolerance (default: 50) |
| `--fee-bps <n>` | Integrator fee (default: 20) |
| `--yes` | Skip confirmation prompt |
| `--simulate-only` | Simulate but don't broadcast |
| `--skip-simulation` | Skip simulation (dangerous) |
| `--wallet <path>` | Override wallet path |
| `--json` | JSON output |

Pipeline: resolve tokens, fetch quote, safety checks, build transaction, simulate, confirm, sign + broadcast, on-chain confirmation, store receipt.

---

### `clawdex quote`

Get a swap quote without executing.

```bash
clawdex quote --in SOL --out USDC --amount 1
clawdex quote --in SOL --out USDC --amount 1 --slippage-bps 100 --json
```

---

### `clawdex balances`

Show SOL and token balances for the configured wallet.

```bash
clawdex balances
clawdex balances --json
```

---

### `clawdex status`

Health check. Verifies RPC connectivity, wallet, fee account, and token list cache.

```bash
clawdex status
clawdex status --json
```

---

### `clawdex receipt`

Look up a stored swap receipt by transaction signature.

```bash
clawdex receipt <tx-signature>
clawdex receipt <tx-signature> --json
```

---

### `clawdex config set`

Set configuration values. Config is stored in `~/.clawdex/config.toml`.

```bash
clawdex config set jupiter_api_key=YOUR_KEY
clawdex config set rpc=https://api.mainnet-beta.solana.com
clawdex config set wallet=~/.config/solana/id.json
clawdex config set fee_bps=20 fee_account=<pubkey>
```

**Keys:** `rpc`, `wallet`, `fee_bps`, `fee_account`, `auto_create_fee_ata`, `receipts_dir`, `jupiter_api_key`

---

### `clawdex safety set`

Configure safety guardrails enforced on every swap.

```bash
clawdex safety set max_slippage_bps=300
clawdex safety set max_trade_sol=10
clawdex safety set allowlist=SOL,USDC,USDT
```

**Keys:** `max_fee_bps`, `max_slippage_bps`, `max_price_impact_bps`, `max_trade_sol`, `allowlist`, `rpc_allowlist`

---

### `clawdex setup-fees`

Pre-create fee token accounts (ATAs) for common tokens. One-time setup for fee collection.

```bash
clawdex setup-fees
clawdex setup-fees --wallet ~/.config/solana/id.json
```

Creates ATAs for USDC, USDT, SOL, JUP, jitoSOL, mSOL, BONK, WIF, RAY, PYTH. Each costs ~0.002 SOL in rent (reclaimable).

---

## JSON API Reference

Every command supports `--json`. Below are the response shapes an agent will receive.

### `swap --json`

```jsonc
// Success
{
  "success": true,
  "signature": "5K2x...",
  "input":  { "mint": "So111...", "symbol": "SOL",  "amount": "1" },
  "output": { "mint": "EPjF...",  "symbol": "USDC", "amount": "173.25" },
  "fees":   { "integrator_fee_bps": 20, "integrator_fee_amount": "0.35" },
  "route":  [{ "venue": "Raydium", "percent": 100 }]
}

// Error
{
  "success": false,
  "error": "SAFETY_CHECK_FAILED",
  "message": "slippage exceeds 300 bps",
  "violations": ["slippage exceeds 300 bps"]
}
```

Error types: `SAFETY_CHECK_FAILED`, `UNKNOWN_TRANSFER`, `SIMULATION_FAILED`, `TRANSACTION_FAILED`, `SEND_FAILED`, `USER_CANCELLED`

### `quote --json`

```jsonc
{
  "input":  { "mint": "So111...", "symbol": "SOL",  "amount": "1" },
  "output": { "mint": "EPjF...",  "symbol": "USDC", "amount": "173.25", "min_amount": "172.39" },
  "price_impact_bps": 5,
  "slippage_bps": 50,
  "route": [{ "venue": "Raydium", "percent": 100 }],
  "fees":  { "integrator_fee_bps": 20, "integrator_fee_amount": "0.35", "integrator_fee_token": "USDC" }
}
```

### `balances --json`

```jsonc
[
  { "token": "SOL",  "symbol": "SOL",  "mint": "So111...", "balance": "5.25",    "decimals": 9 },
  { "token": "USDC", "symbol": "USDC", "mint": "EPjF...",  "balance": "1000.50", "decimals": 6 }
]
```

### `status --json`

```jsonc
{
  "rpc":        { "url": "https://api.mainnet-beta.solana.com", "healthy": true,  "latency_ms": 145 },
  "wallet":     { "configured": true,  "pubkey": "67vq...9SXb" },
  "fee_account": { "configured": true, "pubkey": "76JT...HKK8" },
  "token_list": { "loaded": true,      "count": 2547 }
}
```

### `wallet --json`

```jsonc
{ "pubkey": "67vq...9SXb", "path": "~/.clawdex/wallet.json", "sol_balance": 5.25 }
```

### `wallet generate --json`

```jsonc
{ "pubkey": "8N6F...14Rv", "path": "~/.clawdex/wallet.json", "generated": true }
```

### `onboarding --json`

```jsonc
{
  "success": true,
  "config": {
    "jupiter_api_key": "tes***5678",
    "rpc": "https://api.mainnet-beta.solana.com",
    "wallet": "~/.clawdex/wallet.json",
    "wallet_pubkey": "67vq...9SXb",
    "wallet_generated": true,
    "fee_bps": 20,
    "fee_account": "76JT...HKK8",
    "auto_create_fee_ata": true,
    "receipts_dir": "~/.clawdex/receipts"
  },
  "validation": {
    "jupiter_api_key": { "valid": true, "token_count": 2547 },
    "rpc":             { "healthy": true, "latency_ms": 145 },
    "wallet":          { "valid": true, "pubkey": "67vq...9SXb" },
    "config_written": true
  }
}
```

### `config set --json` / `safety set --json`

```jsonc
{ "success": true, "updated": [{ "key": "rpc", "value": "https://..." }] }
```

### `receipt --json`

```jsonc
{
  "timestamp": "2026-02-13T10:30:45.123Z",
  "txSignature": "5K2x...",
  "inputToken":  { "symbol": "SOL",  "name": "Solana",   "mint": "So111...", "decimals": 9 },
  "outputToken": { "symbol": "USDC", "name": "USD Coin", "mint": "EPjF...",  "decimals": 6 },
  "inputAmount": "1",
  "outputAmount": "173.25",
  "route": "Raydium (100%)",
  "fees": { "platformFeeBps": 20, "platformFeeAmount": "0.35", "networkFee": 5000 },
  "status": "success"
}
```

---

## Configuration

ClawDex uses layered configuration. Later sources override earlier ones:

1. **Built-in defaults**
2. **Config file** `~/.clawdex/config.toml`
3. **Environment variables** `CLAWDEX_RPC`, `CLAWDEX_WALLET`, `CLAWDEX_FEE_BPS`, `CLAWDEX_FEE_ACCOUNT`, `CLAWDEX_RECEIPTS_DIR`, `JUPITER_API_KEY`
4. **CLI flags** `--wallet`, `--rpc`, etc.

### Example config file

```toml
jupiter_api_key = "your-api-key"
rpc = "https://api.mainnet-beta.solana.com"
wallet = "~/.config/solana/id.json"
fee_bps = 20
fee_account = "76JTogdqp98XRkBXMdEz77P36Gq4LjikRdqzqKGqHKK8"
auto_create_fee_ata = true
receipts_dir = "~/.clawdex/receipts"

[safety]
max_slippage_bps = 300
max_price_impact_bps = 500
max_trade_sol = 10
allowlist = ["SOL", "USDC", "USDT"]
```

### File paths

| Path | Contents |
|------|----------|
| `~/.clawdex/config.toml` | All configuration |
| `~/.clawdex/wallet.json` | Generated wallet keypair (if using `--generate-wallet`) |
| `~/.clawdex/token-cache.json` | Jupiter token list cache (auto-managed, 1h TTL) |
| `~/.clawdex/receipts/receipts.jsonl` | Swap receipt log (append-only) |

---

## Safety Guardrails

ClawDex uses a **fail-closed** safety model. Every swap is checked before execution:

| Guardrail | Config key | What it does |
|-----------|-----------|--------------|
| Max slippage | `max_slippage_bps` | Rejects swaps above this slippage |
| Max trade size | `max_trade_sol` | Rejects swaps larger than this (in SOL terms) |
| Max price impact | `max_price_impact_bps` | Rejects swaps with high price impact |
| Max fee | `max_fee_bps` | Rejects if integrator fee exceeds this |
| Token allowlist | `allowlist` | Only allow swaps involving these tokens |
| RPC allowlist | `rpc_allowlist` | Only allow these RPC endpoints |

Additionally:
- **Transaction simulation** -- every swap is simulated before broadcast. The result is parsed into a transfer diff showing exact balance changes.
- **Non-TTY safety** -- in piped/agent mode, `--yes` is required to execute. No implicit confirmations.

---

## Integrator Fees

A 0.2% (20 bps) platform fee is applied by default via Jupiter's integrator fee system.

```bash
# Configure your fee wallet
clawdex config set fee_account=YOUR_WALLET_PUBKEY

# Pre-create token accounts (one-time, ~0.002 SOL each)
clawdex setup-fees

# Fees are collected automatically on every swap
```

Override per-swap with `--fee-bps 0` to disable, or change the default with `clawdex config set fee_bps=50`.

If a fee ATA doesn't exist for a given output token, it's auto-created on-the-fly (configurable via `auto_create_fee_ata`).

---

## Exit Codes

| Code | Constant | Meaning |
|------|----------|---------|
| 0 | `EXIT_SUCCESS` | Success |
| 1 | `EXIT_GENERAL` | General error |
| 2 | `EXIT_SAFETY` | Safety check failed |
| 3 | `EXIT_SIMULATION` | Simulation failed |
| 4 | `EXIT_SEND` | Send/confirm failed |
| 5 | `EXIT_CONFIG` | Configuration error |

---

## Development

Requires [Bun](https://bun.sh).

```bash
git clone https://github.com/JoelCCodes/ClawDex.git
cd ClawDex
bun install
bun run src/cli.ts status       # run in dev mode
bun test                        # 172 tests
bun run typecheck               # tsc --noEmit
bun run build                   # compile to dist/
```

### Architecture

```
src/
  cli.ts              Entry point, command registration
  types.ts            TypeScript types, exit codes
  constants.ts        Jupiter URLs, program IDs, token mints, defaults
  core/
    config.ts         TOML config: load, resolve, set
    wallet.ts         Keypair loading, generation, signing
    tokens.ts         Token resolution (hardcoded + Jupiter cache)
    output.ts         Output formatting (human/chalk vs JSON)
    jupiter.ts        Jupiter API client (quote, swap, retry, fee ATA)
    safety.ts         Safety validation engine
    simulate.ts       Transaction simulation, transfer diff
    receipts.ts       JSONL receipt storage
    connection.ts     Solana Connection factory
  commands/
    onboarding.ts     clawdex onboarding
    wallet.ts         clawdex wallet
    config.ts         clawdex config set
    safety.ts         clawdex safety set
    status.ts         clawdex status
    balances.ts       clawdex balances
    quote.ts          clawdex quote
    swap.ts           clawdex swap
    receipt.ts        clawdex receipt
    setup-fees.ts     clawdex setup-fees
```

---

## License

MIT
