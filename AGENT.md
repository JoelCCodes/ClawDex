# ClawDex Agent Integration Guide

This guide is for AI agents and bots that use ClawDex to trade on Solana. It covers setup, the trading loop, error handling, and safety.

## Install

```bash
npm install -g clawdex@latest
```

Verify:
```bash
clawdex --version   # should print 0.2.0+
```

## Setup (non-interactive)

Agents must provide all flags — ClawDex will not prompt:

```bash
clawdex onboarding \
  --jupiter-api-key "$JUPITER_API_KEY" \
  --rpc "$SOLANA_RPC_URL" \
  --wallet ~/.config/solana/id.json \
  --max-slippage-bps 300 \
  --max-trade-sol 1 \
  --json
```

Or generate a fresh wallet:
```bash
clawdex onboarding \
  --jupiter-api-key "$JUPITER_API_KEY" \
  --rpc "$SOLANA_RPC_URL" \
  --generate-wallet \
  --wallet-output ~/.clawdex/wallet.json \
  --json
```

Check the `success` field in the response:
```json
{ "success": true, "validation": { "jupiter_api_key": { "valid": true }, "rpc": { "healthy": true }, "wallet": { "valid": true } } }
```

## Environment Variables

These override config file values (useful in containers/CI):

| Variable | Description |
|----------|-------------|
| `JUPITER_API_KEY` | Jupiter API key |
| `CLAWDEX_RPC` | Solana RPC endpoint |
| `CLAWDEX_WALLET` | Path to wallet keypair JSON |

## Trading Loop

Every agent trade should follow this sequence:

### 1. Health check

```bash
clawdex status --json
```

Abort if `rpc.healthy` is `false`.

### 2. Check balances

```bash
clawdex balances --json
```

Returns all token accounts (including zero-balance). Parse the `balance` field as a string — it preserves full decimal precision.

### 3. Simulate

```bash
clawdex swap --in SOL --out USDC --amount 0.01 --simulate-only --json
```

No `--yes` needed for simulation. Check the output amount and route before committing.

### 4. Execute

```bash
clawdex swap --in SOL --out USDC --amount 0.01 --yes --json
```

`--yes` is **required** for non-interactive execution. Without it, ClawDex exits with code 1.

### 4b. Send tokens (transfer without swap)

```bash
clawdex send --to <address> --token SOL --amount 0.01 --yes --json
```

Sends SOL or any SPL token to a recipient. For SPL tokens, the recipient's token account is created automatically if needed. `--simulate-only` works here too.

### 5. Verify

```bash
clawdex balances --json
```

Confirm the balances changed as expected. RPC can lag — wait a few seconds and retry if stale.

## Handling Responses

Every `--json` response is a single JSON object on stdout. Errors go to stderr.

### Success

```json
{
  "success": true,
  "signature": "5Qm...",
  "input": { "mint": "So111...", "symbol": "SOL", "amount": "0.01" },
  "output": { "mint": "EPjF...", "symbol": "USDC", "amount": "0.845" },
  "route": [{ "venue": "Raydium", "percent": 100 }]
}
```

### Errors

```json
{ "error": "SAFETY_CHECK_FAILED", "message": "...", "violations": [...] }
```

Error types: `SAFETY_CHECK_FAILED`, `UNKNOWN_TRANSFER`, `SIMULATION_FAILED`, `TRANSACTION_FAILED`, `SEND_FAILED`, `USER_CANCELLED`

## Exit Codes

Parse the exit code to decide what to do next:

| Code | Constant | Action |
|------|----------|--------|
| 0 | `EXIT_SUCCESS` | Trade succeeded |
| 1 | `EXIT_GENERAL` | Check error message, may be transient |
| 2 | `EXIT_CONFIG` | Fix config (missing key, bad wallet path) |
| 3 | `EXIT_SAFETY` | Reduce amount or adjust safety limits |
| 4 | `EXIT_SIMULATION` | Route may be bad — try different pair or amount |
| 5 | `EXIT_SEND` | Network issue — retry with backoff |

## Safety Guardrails

Set limits to prevent runaway trades:

```bash
clawdex safety set max_slippage_bps=300 max_trade_sol=1 max_price_impact_bps=100
```

| Guardrail | What it does |
|-----------|-------------|
| `max_slippage_bps` | Reject swaps with slippage above N bps |
| `max_trade_sol` | Reject swaps larger than N SOL equivalent |
| `max_price_impact_bps` | Reject swaps with price impact above N bps |

When a guardrail triggers, exit code is 3 and the JSON response includes the specific `violations` array.

## Token Resolution

Tokens can be specified by symbol or mint address:
- **Symbols**: `SOL`, `USDC`, `USDT` (instant, no network call)
- **Mint addresses**: Any valid base58 address (looks up Jupiter verified token list, cached 1hr)

## Tips

- Always use `--json` — human output is not machine-parseable
- Always use `--yes` for real swaps and sends — without it, exit code 1
- `--simulate-only` does **not** need `--yes`
- RPC balance updates can lag 5-10 seconds on public endpoints — retry reads
- Use a dedicated RPC (Helius, Triton, etc.) for production agents
- Store receipts in `~/.clawdex/receipts/` for audit trails
- The `quote` command is cheaper than `swap --simulate-only` (no simulation, just price)
