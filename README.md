# ClawDex

A Solana DEX trading CLI powered by Jupiter. Built with TypeScript and Bun.

ClawDex provides a command-line interface for swapping tokens on Solana through the Jupiter aggregator, with built-in transaction simulation, safety guardrails, and receipt logging. It supports both human-readable output and a structured JSON mode for agent/bot integration.

## Quick Start

```bash
# Install via npx (no install needed)
npx clawdex status

# Or install globally
npm install -g clawdex

# Set your Jupiter API key (free at https://portal.jup.ag/api-keys)
clawdex config set jupiter_api_key=YOUR_API_KEY

# Configure RPC and wallet
clawdex config set rpc=https://api.mainnet-beta.solana.com
clawdex config set wallet=~/.config/solana/id.json

# Check health
clawdex status

# Get a swap quote
clawdex quote --in SOL --out USDC --amount 1

# Execute a swap
clawdex swap --in SOL --out USDC --amount 1 --slippage-bps 50
```

## Installation

### Via npm (recommended)

```bash
npm install -g clawdex
```

Or run without installing:

```bash
npx clawdex <command>
```

### From source

Requires [Bun](https://bun.sh) runtime for development.

```bash
git clone https://github.com/JoelCCodes/ClawDex.git
cd ClawDex
bun install
bun run src/cli.ts <command>
```

## Jupiter API Key

ClawDex uses the [Jupiter Swap API](https://dev.jup.ag/) which requires an API key. Get a free key at **[portal.jup.ag/api-keys](https://portal.jup.ag/api-keys)**, then configure it:

```bash
# Via config
clawdex config set jupiter_api_key=YOUR_API_KEY

# Or via environment variable
export JUPITER_API_KEY=YOUR_API_KEY
```

## Commands

### `clawdex status`

Health check. Verifies RPC connectivity, wallet configuration, fee account, and token list cache.

```bash
clawdex status
clawdex status --json
```

### `clawdex balances`

Show SOL and token balances for the configured wallet.

```bash
clawdex balances
clawdex balances --wallet ~/.config/solana/id.json --json
```

### `clawdex quote`

Get a swap quote from Jupiter without executing.

```bash
clawdex quote --in SOL --out USDC --amount 1
clawdex quote --in SOL --out USDC --amount 1 --slippage-bps 100 --json
```

### `clawdex swap`

Execute a token swap through Jupiter. This runs an 8-step pipeline:

1. Resolve input/output tokens
2. Fetch quote from Jupiter
3. Run safety checks against configured guardrails
4. Build swap transaction via Jupiter
5. Simulate the transaction and compute a transfer diff
6. Display the transfer summary and prompt for confirmation
7. Sign and broadcast the transaction
8. Confirm on-chain and store a receipt

```bash
# Interactive swap with confirmation prompt
clawdex swap --in SOL --out USDC --amount 1 --slippage-bps 50

# Skip confirmation (required for non-interactive/agent use)
clawdex swap --in SOL --out USDC --amount 1 --yes

# Simulate only (don't broadcast)
clawdex swap --in SOL --out USDC --amount 1 --simulate-only

# Agent mode: structured JSON output, no prompts
clawdex swap --in SOL --out USDC --amount 1 --yes --json
```

**Options:**

| Flag | Description |
|------|-------------|
| `--in <token>` | Input token symbol or mint address |
| `--out <token>` | Output token symbol or mint address |
| `--amount <number>` | Amount of input token |
| `--slippage-bps <n>` | Slippage tolerance in basis points (default: 50) |
| `--fee-bps <n>` | Integrator fee in basis points (default: 20) |
| `--yes` | Skip confirmation prompt |
| `--json` | Output structured JSON |
| `--simulate-only` | Simulate but don't broadcast |
| `--skip-simulation` | Skip simulation (dangerous) |
| `--wallet <path>` | Override wallet keypair path |

### `clawdex receipt`

Look up a stored swap receipt by transaction signature.

```bash
clawdex receipt <transaction-signature>
clawdex receipt <transaction-signature> --json
```

### `clawdex config set`

Set configuration values. Config is stored in `~/.clawdex/config.toml`.

```bash
clawdex config set jupiter_api_key=YOUR_API_KEY
clawdex config set rpc=https://api.mainnet-beta.solana.com
clawdex config set wallet=~/.config/solana/id.json
clawdex config set fee_bps=20 fee_account=<pubkey>
clawdex config set auto_create_fee_ata=true
```

**Config keys:** `rpc`, `wallet`, `fee_bps`, `fee_account`, `auto_create_fee_ata`, `receipts_dir`, `jupiter_api_key`

### `clawdex safety set`

Configure safety guardrails. These limits are enforced on every swap.

```bash
clawdex safety set max_slippage_bps=300
clawdex safety set max_trade_sol=10
clawdex safety set allowlist=SOL,USDC,USDT
```

**Safety keys:** `max_fee_bps`, `max_slippage_bps`, `max_price_impact_bps`, `max_trade_sol`, `allowlist`, `rpc_allowlist`

### `clawdex setup-fees`

Pre-create fee token accounts (ATAs) for common tokens on the configured fee wallet. This is a one-time setup step for integrators who want to collect fees.

```bash
# Pre-create ATAs for top 10 tokens (USDC, USDT, SOL, JUP, jitoSOL, mSOL, BONK, WIF, RAY, PYTH)
clawdex setup-fees

# With a specific payer wallet
clawdex setup-fees --wallet ~/.config/solana/id.json
```

Each ATA costs ~0.002 SOL in rent (one-time, reclaimable). The payer wallet covers the rent.

## Integrator Fees

ClawDex includes a built-in integrator fee system powered by Jupiter's platform fee. A 0.2% (20 bps) fee is applied by default on every swap and collected to the configured fee wallet.

### How it works

1. The `fee_bps` config sets the fee percentage (default: 20 bps = 0.2%)
2. The `fee_account` config sets the wallet that receives fees
3. For each swap, ClawDex derives the fee wallet's Associated Token Account (ATA) for the output token
4. If the ATA exists on-chain, the fee is collected. If not, the fee is silently skipped for that token

### Setting up fee collection

```bash
# 1. Configure your fee wallet
clawdex config set fee_account=YOUR_WALLET_PUBKEY

# 2. Pre-create ATAs for common tokens (one-time, costs ~0.002 SOL each)
clawdex setup-fees

# 3. Fees are now collected automatically on every swap
clawdex swap --in SOL --out USDC --amount 1 --yes
```

### Auto-create fee ATAs

By default, if a fee ATA doesn't exist for a token, it is auto-created on-the-fly (~0.002 SOL rent, paid by the swapper). To disable this and silently skip fees for missing ATAs:

```bash
clawdex config set auto_create_fee_ata=false
```

When disabled, pre-create ATAs with `setup-fees` for the tokens you want to collect fees on.

### Overriding or disabling fees

```bash
# Disable fees for a single swap
clawdex swap --in SOL --out USDC --amount 1 --fee-bps 0

# Change the default fee percentage
clawdex config set fee_bps=50  # 0.5%

# Remove the fee account entirely
clawdex config set fee_account=
```

## Configuration

ClawDex uses a layered configuration system. Values are resolved in this order (later wins):

1. **Defaults** - Built-in defaults
2. **Config file** - `~/.clawdex/config.toml`
3. **Environment variables** - `CLAWDEX_RPC`, `CLAWDEX_WALLET`, `CLAWDEX_FEE_BPS`, `CLAWDEX_FEE_ACCOUNT`, `CLAWDEX_RECEIPTS_DIR`, `JUPITER_API_KEY`
4. **CLI flags** - `--wallet`, `--json`, etc.

Example `~/.clawdex/config.toml`:

```toml
jupiter_api_key = "your-api-key-here"
rpc = "https://api.mainnet-beta.solana.com"
wallet = "~/.config/solana/id.json"
fee_bps = 20
fee_account = "YourFeeWalletPublicKey"
auto_create_fee_ata = true
receipts_dir = "~/.clawdex/receipts"

[safety]
max_fee_bps = 100
max_slippage_bps = 300
max_price_impact_bps = 500
max_trade_sol = 10
allowlist = ["SOL", "USDC", "USDT"]
```

## Safety Model

ClawDex uses a **fail-closed** safety model:

- **Transaction simulation** - Every swap is simulated before broadcast. The simulation result is parsed into a transfer diff showing balance changes.
- **Configurable guardrails** - Maximum fee, slippage, price impact, trade size, and token allowlists are enforced before the transaction is even built.
- **Agent safety** - In non-TTY mode (piped input), the `--yes` flag is required. All safety checks still apply in `--yes --json` mode.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Safety check failed |
| 3 | Simulation failed |
| 4 | Send/confirm failed |
| 5 | Configuration error |

## Agent / Bot Integration

Every command supports `--json` for structured output. For automated trading:

```bash
# Get a quote and parse with jq
clawdex quote --in SOL --out USDC --amount 1 --json | jq '.output_amount'

# Execute a swap in agent mode
clawdex swap --in SOL --out USDC --amount 1 --yes --json

# Check a receipt
clawdex receipt <txsig> --json
```

JSON error responses include an `error` field and numeric `code` matching the exit codes above.

## Receipts

Every swap attempt (including failures) is logged to `~/.clawdex/receipts/receipts.jsonl`. Each line is a JSON object containing the timestamp, tokens, amounts, route, fees, transfer diff, status, and any error message.

## Development

```bash
# Run tests
bun test

# Type checking
bun run typecheck

# Linting
bun run lint

# Run the CLI (dev mode)
bun run src/cli.ts status

# Build for Node.js
bun run build
node dist/cli.js status
```

## Architecture

```
src/
  cli.ts              # Entry point, Commander setup, command registration
  types.ts            # Shared TypeScript types and exit codes
  constants.ts        # Jupiter URLs, program IDs, token mints, defaults
  core/
    config.ts         # TOML config loading, layered resolution, set operations
    wallet.ts         # Keypair loading, KeypairSigner wrapper
    tokens.ts         # Token resolution (hardcoded + Jupiter token list cache)
    output.ts         # Output formatting (human/chalk vs JSON)
    jupiter.ts        # Jupiter Swap API client (quote, swap, retry, fee ATA)
    safety.ts         # Safety validation (fee, slippage, impact, size, allowlist)
    simulate.ts       # Transaction simulation, transfer diff
    receipts.ts       # JSONL receipt storage and lookup
    connection.ts     # Solana Connection factory
  commands/
    config.ts         # clawdex config set
    safety.ts         # clawdex safety set
    status.ts         # clawdex status
    balances.ts       # clawdex balances
    quote.ts          # clawdex quote
    receipt.ts        # clawdex receipt
    swap.ts           # clawdex swap (8-step pipeline)
    setup-fees.ts     # clawdex setup-fees (pre-create fee ATAs)
tests/
  core/               # Unit tests for core modules
  commands/           # Integration tests for CLI commands
  fixtures/           # Mock data (keypairs, configs, API responses)
  helpers.ts          # Test utilities (temp dirs, file writers)
```

## License

MIT
