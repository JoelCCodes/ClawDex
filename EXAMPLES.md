# ClawDex CLI Examples

Reference for agents and integrators showing expected inputs and outputs.

## Setup

### Non-interactive onboarding (for agents/CI)

```bash
clawdex onboarding \
  --jupiter-api-key YOUR_KEY \
  --rpc https://api.mainnet-beta.solana.com \
  --wallet ~/.config/solana/id.json \
  --json
```

```json
{
  "success": true,
  "config": {
    "jupiter_api_key": "YOU***_KEY",
    "rpc": "https://api.mainnet-beta.solana.com",
    "wallet": "~/.config/solana/id.json",
    "wallet_pubkey": "7xKp...3mFv",
    "wallet_generated": false,
    "fee_bps": 20,
    "fee_account": "76JTogdqp98XRkBXMdEz77P36Gq4LjikRdqzqKGqHKK8",
    "auto_create_fee_ata": true,
    "receipts_dir": "~/.clawdex/receipts"
  },
  "validation": {
    "jupiter_api_key": { "valid": true, "token_count": 1423 },
    "rpc": { "healthy": true, "latency_ms": 150 },
    "wallet": { "valid": true, "pubkey": "7xKp...3mFv" },
    "config_written": true
  }
}
```

### Generate a new wallet

```bash
clawdex onboarding \
  --jupiter-api-key YOUR_KEY \
  --rpc https://api.mainnet-beta.solana.com \
  --generate-wallet \
  --wallet-output ~/.clawdex/wallet.json \
  --json
```

## Health Check

```bash
clawdex status --json
```

```json
{
  "rpc": {
    "url": "https://api.mainnet-beta.solana.com",
    "healthy": true,
    "latency_ms": 232
  },
  "wallet": {
    "configured": true,
    "pubkey": "67vqYAKUNk2DEwMNSzmfKvDWJqP5Q7ENAbat9kt89SXb"
  },
  "fee_account": {
    "configured": true,
    "pubkey": "76JTogdqp98XRkBXMdEz77P36Gq4LjikRdqzqKGqHKK8"
  },
  "token_list": {
    "loaded": true,
    "count": 1
  }
}
```

## Balances

### Human output

```bash
clawdex balances
```

```
Wallet: 67vqYAKUNk2DEwMNSzmfKvDWJqP5Q7ENAbat9kt89SXb

Token  Balance      Mint
-----  -----------  ----------------------------------
SOL    0.017495816  So11111111111111111111111111111111
```

Zero-balance token accounts are hidden in human output.

### JSON output

```bash
clawdex balances --json
```

```json
[
  {
    "token": "SOL",
    "symbol": "SOL",
    "mint": "So11111111111111111111111111111111",
    "balance": "0.017495816",
    "decimals": 9
  },
  {
    "token": "USDC",
    "symbol": "USDC",
    "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "balance": "0",
    "decimals": 6
  }
]
```

JSON output includes all token accounts (including zero-balance) for completeness.

## Quoting

```bash
clawdex quote --in SOL --out USDC --amount 0.01 --json
```

Tokens can be specified by symbol (`SOL`, `USDC`, `USDT`) or mint address.

## Swapping

### Simulate first (no `--yes` required)

```bash
clawdex swap --in USDC --out SOL --amount 0.76 --simulate-only
```

```
Simulation Result
  Input:  0.76 USDC
  Output: 0.008958047 SOL
  Route:  HumidiFi (100%)

Transfer Summary:
  SOL: +0.008941619 SOL
  USDC: -0.760259
  USDC: +0.760259
  SOL: -0.008967749
  Network fee: 0.000005000 SOL
```

### Execute a swap (interactive confirmation)

```bash
clawdex swap --in USDC --out SOL --amount 0.760259
```

```
Swap Summary
  Input:  0.760259 USDC
  Output: ~0.008959253 SOL
  Route:  HumidiFi (100%)
  Slippage: 50 bps
  Impact: 0%
  Fee: 0.000017954 SOL (20 bps)

Transfer Summary:
  SOL: +0.008854253 SOL
  USDC: -0.760259
  SOL: +0.000017954
  USDC: +0.760259
  SOL: -0.008977207
  Network fee: 0.000005000 SOL

Proceed with swap? (y/N) y

Swap successful!
  Signature: 2WyDL2dvy3V23ta1Y8C49S82Qk933AQiLLPVVJc1B3TiuvDxnBexGGGny4deUtUyT7k2VLGH5LEm6y4yPVcgF4Eo
```

### Execute without confirmation (for agents)

```bash
clawdex swap --in SOL --out USDC --amount 0.005 --yes
```

The `--yes` flag is required for non-interactive (non-TTY) environments. Simulation-only mode does not require it.

### JSON swap output

```bash
clawdex swap --in SOL --out USDC --amount 0.005 --yes --json
```

```json
{
  "success": true,
  "signature": "3pw18dG2gVH8Sm8G5ooKG2ahXY5WRToFu3uYSHjt8PJntPqKyF1r4DFTRjBxLba4LbJt83iH7K4aui7FSc8mYqmX",
  "input": { "mint": "So11111111111111111111111111111111111111112", "symbol": "SOL", "amount": "0.005" },
  "output": { "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "symbol": "USDC", "amount": "0.422469" },
  "fees": {
    "integrator_fee_bps": 20,
    "integrator_fee_amount": "0.000846"
  },
  "route": [
    { "venue": "Invariant", "percent": 100 }
  ]
}
```

## Sending Tokens

### Simulate a send (no `--yes` required)

```bash
clawdex send --to 7xKp...3mFv --token SOL --amount 0.01 --simulate-only
```

```
Simulation Result
  From:  67vq...9SXb
  To:    7xKp...3mFv
  Token: 0.01 SOL

Transfer Summary:
  SOL: -0.010005000 SOL
  Network fee: 0.000005000 SOL
```

### Execute a send (interactive confirmation)

```bash
clawdex send --to 7xKp...3mFv --token SOL --amount 0.01
```

```
Send Summary
  From:  67vq...9SXb
  To:    7xKp...3mFv
  Token: 0.01 SOL

Transfer Summary:
  SOL: -0.010005000 SOL
  Network fee: 0.000005000 SOL

Proceed with send? (y/N) y

Send successful!
  Signature: 4vRn...8xQm
```

### Execute without confirmation (for agents)

```bash
clawdex send --to 7xKp...3mFv --token SOL --amount 0.01 --yes --json
```

### JSON send output

```json
{
  "success": true,
  "signature": "4vRn...8xQm",
  "from": "67vq...9SXb",
  "to": "7xKp...3mFv",
  "token": { "symbol": "SOL", "mint": "So11111111111111111111111111111111111111112", "amount": "0.01" },
  "networkFee": 0.000005
}
```

### Send an SPL token

```bash
clawdex send --to 7xKp...3mFv --token USDC --amount 5 --yes --json
```

If the recipient doesn't have a token account for that token, ClawDex creates one automatically (sender pays the rent).

## Safety Guardrails

### Set limits

```bash
clawdex safety set max_slippage_bps=300 max_trade_sol=1 max_price_impact_bps=100
```

### Set via onboarding

```bash
clawdex onboarding \
  --jupiter-api-key YOUR_KEY \
  --rpc https://api.mainnet-beta.solana.com \
  --wallet ~/.config/solana/id.json \
  --max-slippage-bps 300 \
  --max-trade-sol 1 \
  --max-price-impact-bps 100 \
  --json
```

When a swap violates a guardrail, it exits with code 3 (`EXIT_SAFETY`):

```json
{
  "success": false,
  "error": "SAFETY_CHECK_FAILED",
  "message": "Safety check failed: slippage 500 bps exceeds max 300 bps",
  "violations": ["slippage 500 bps exceeds max 300 bps"]
}
```

## Configuration

### Set individual values

```bash
clawdex config set rpc=https://my-rpc.example.com
clawdex config set wallet=~/.config/solana/id.json
clawdex config set jupiter_api_key=YOUR_KEY
```

Config is stored at `~/.clawdex/config.toml`.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error |
| 3 | Safety check failed |
| 4 | Simulation failed |
| 5 | Send/broadcast failed |

## Agent Workflow (Typical)

```bash
# 1. Check health
clawdex status --json

# 2. Check balances
clawdex balances --json

# 3. Get a quote
clawdex quote --in SOL --out USDC --amount 0.01 --json

# 4. Simulate
clawdex swap --in SOL --out USDC --amount 0.01 --simulate-only --json

# 5. Execute
clawdex swap --in SOL --out USDC --amount 0.01 --yes --json

# 6. Send tokens to another wallet
clawdex send --to <address> --token SOL --amount 0.01 --yes --json
```

All commands support `--json` for machine-readable output. Agents should always use `--json` and `--yes` flags.
