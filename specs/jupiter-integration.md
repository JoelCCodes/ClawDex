# Jupiter Integration

## Overview

Clawdex routes all swaps through the Jupiter aggregator API. This is the primary (and v1-only) execution path. Jupiter provides best-price routing across Solana liquidity venues and supports integrator fee collection.

## API Endpoints

### Quote API
- Endpoint: `https://api.jup.ag/swap/v1/quote`
- Method: GET
- Key params:
  - `inputMint` - Input token mint address
  - `outputMint` - Output token mint address
  - `amount` - Amount in smallest unit (lamports for SOL, etc.)
  - `slippageBps` - Slippage tolerance in basis points
  - `platformFeeBps` - Integrator fee in basis points (THIS IS HOW WE MONETIZE)

### Swap API
- Endpoint: `https://api.jup.ag/swap/v1/swap`
- Method: POST
- Body includes:
  - `quoteResponse` - The quote response object
  - `userPublicKey` - Wallet public key
  - `feeAccount` - ATA of the integrator fee account for the output token
  - `dynamicComputeUnitLimit` - Let Jupiter optimize compute
  - `dynamicSlippage` - Optional dynamic slippage

## Fee Collection Mechanism

### How platformFeeBps works
- Added to the quote request
- Jupiter calculates the fee as a percentage of the output amount
- The fee is deducted from the output and sent to `feeAccount`
- `feeAccount` must be an Associated Token Account (ATA) of your fee wallet for the output token mint
- If the ATA doesn't exist, you may need to create it before the swap

### Fee Account Setup
- You have a master fee wallet (public key stored in config as `fee_account`)
- For each output token, derive the ATA: `getAssociatedTokenAddress(outputMint, feeWallet)`
- If the ATA doesn't exist on-chain, the swap instruction may include its creation, or you need to pre-create it

### Fee Transparency
- ALWAYS display the fee amount and destination in human-readable output
- ALWAYS include fee details in JSON output
- Allow `--fee-bps 0` to disable fees
- Default fee from config, overridable per-command

## Token Resolution

Map human-readable symbols to mint addresses:
- SOL: `So11111111111111111111111111111111111111112` (wrapped SOL)
- USDC: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- USDT: `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`

For other tokens: use Jupiter's token list API or accept raw mint addresses.

Jupiter token list: `https://tokens.jup.ag/tokens?tags=verified`

## Requirements

### Core Functionality
- Fetch quotes with fee params attached
- Build swap transactions from quote responses
- Handle ATA creation for fee accounts when needed
- Support both exact-in amounts
- Parse route info from quote response for display

### Error Handling
- Handle rate limiting (429) with exponential backoff
- Handle stale quotes (blockhash expired) by re-quoting
- Handle insufficient balance errors clearly
- Handle Jupiter API downtime gracefully

### Behavior
- Always include `platformFeeBps` in quote requests (even if 0)
- Always include `feeAccount` in swap requests (derived ATA for output mint)
- Cache token list locally with TTL (e.g., 1 hour)
- Log all API requests/responses at debug level

## Acceptance Criteria

- [ ] Quote requests include platformFeeBps parameter
- [ ] Swap requests include correct feeAccount (ATA for output mint)
- [ ] Fee amounts are correctly displayed to users
- [ ] Token symbols resolve to correct mint addresses
- [ ] API errors are handled gracefully with clear messages
- [ ] Rate limiting is handled with backoff
- [ ] Stale quotes trigger automatic re-quote
