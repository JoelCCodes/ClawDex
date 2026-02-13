# ClawDex

A Solana DEX trading CLI powered by Jupiter. Built with TypeScript and Bun.

ClawDex provides a command-line interface for swapping tokens on Solana through the Jupiter aggregator, with built-in transaction simulation, safety guardrails, and receipt logging. It supports both human-readable output and a structured JSON mode for agent/bot integration.

## Quick Start

```bash
# Install dependencies
bun install

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

Requires [Bun](https://bun.sh) runtime.

```bash
git clone https://github.com/JoelCCodes/ClawDex.git
cd ClawDex
bun install
```

Run directly:

```bash
bun run src/cli.ts <command>
```

Or build a binary:

```bash
bun run build
./dist/cli <command>
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
| `--fee-bps <n>` | Integrator fee in basis points |
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
clawdex config set fee_bps=50 fee_account=<pubkey>
```

**Config keys:** `rpc`, `wallet`, `fee_bps`, `fee_account`, `receipts_dir`, `jupiter_api_key`

### `clawdex safety set`

Configure safety guardrails. These limits are enforced on every swap.

```bash
clawdex safety set max_slippage_bps=300
clawdex safety set max_trade_sol=10
clawdex safety set allowlist=SOL,USDC,USDT
```

**Safety keys:** `max_fee_bps`, `max_slippage_bps`, `max_price_impact_bps`, `max_trade_sol`, `allowlist`, `rpc_allowlist`

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
fee_bps = 50
fee_account = "YourFeeWalletPublicKey"
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

- **Transaction simulation** - Every swap is simulated before broadcast. The simulation result is parsed into an instruction-level transfer diff showing exactly where funds will go.
- **Unknown address rejection** - If any transfer destination is not in the known address set (your wallet, your ATAs, Jupiter program, fee account, system programs), the swap is rejected.
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

# Run the CLI
bun run src/cli.ts status
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
    simulate.ts       # Transaction simulation, transfer diff, address validation
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
tests/
  core/               # Unit tests for core modules
  commands/           # Integration tests for CLI commands
  fixtures/           # Mock data (keypairs, configs, API responses)
  helpers.ts          # Test utilities (temp dirs, file writers)
```

## License

MIT
