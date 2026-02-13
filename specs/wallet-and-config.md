# Wallet & Configuration

## Overview

Clawdex uses a TOML config file and supports multiple wallet sources. Configuration is layered: defaults < config file < environment variables < CLI flags.

## Config File

Location: `~/.clawdex/config.toml`

```toml
# RPC endpoint
rpc = "https://api.mainnet-beta.solana.com"

# Path to wallet keypair JSON file
wallet = "~/.config/solana/id.json"

# Integrator fee settings
fee_bps = 20
fee_account = "YourFeeWalletPublicKeyHere"

# Receipt storage
receipts_dir = "~/.clawdex/receipts"

[safety]
max_fee_bps = 100
max_price_impact_bps = 300
max_trade_sol = 10.0
# allowlist = ["USDC", "USDT", "SOL"]
# rpc_allowlist = ["https://api.mainnet-beta.solana.com"]
```

## Environment Variables

Override any config value:
- `CLAWDEX_RPC` - RPC endpoint
- `CLAWDEX_WALLET` - Wallet keypair path
- `CLAWDEX_FEE_BPS` - Integrator fee
- `CLAWDEX_FEE_ACCOUNT` - Fee wallet public key
- `CLAWDEX_RECEIPTS_DIR` - Receipt storage directory

## Wallet Support

### Keypair file (v1)
- Standard Solana keypair JSON file (array of bytes)
- Load with `@solana/web3.js` Keypair.fromSecretKey
- Path from config, env var, or `--wallet` flag

### External signer interface (v1.1, stub only in v1)
- For agents that manage keys externally
- Interface: receive unsigned transaction, return signed transaction
- Not implemented in MVP, but design the signing interface to be pluggable

## Requirements

### Core Functionality
- Read and parse TOML config from `~/.clawdex/config.toml`
- Create config directory and default config if not exists on first run
- Layer: defaults < config < env vars < CLI flags
- Validate all config values on load (valid pubkeys, valid URLs, numeric ranges)

### Behavior
- `clawdex config set key=value` writes to config file, preserving comments where possible
- `clawdex safety set key=value` writes to `[safety]` section
- Missing config file: create with defaults, warn user to configure fee_account
- Invalid config: fail with clear error message pointing to the bad field

### Error Handling
- Missing wallet file: clear error with path shown
- Invalid keypair: clear error
- RPC unreachable: clear error with URL shown
- Invalid fee_account pubkey: error on config load, not at swap time

## Acceptance Criteria

- [ ] Config file is read from `~/.clawdex/config.toml`
- [ ] Config directory is created if missing
- [ ] Environment variables override config file values
- [ ] CLI flags override environment variables
- [ ] Wallet keypair loads correctly from JSON file
- [ ] Config validation catches invalid values early
- [ ] `config set` and `safety set` commands persist values correctly
