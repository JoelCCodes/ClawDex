# Transaction Safety & Simulation

## Overview

Every swap transaction must be simulated before broadcast. The CLI inspects all instructions to detect unexpected transfers, enforce guardrails, and provide full transparency. This is critical for agent-safety.

## Simulation Flow

1. Build transaction from Jupiter swap response
2. Simulate transaction via `simulateTransaction` RPC call
3. Parse simulation result for:
   - Success/failure
   - Compute units consumed
   - Log messages
   - Balance changes (pre/post token balances)
4. Compute instruction-level transfer diff
5. Validate against safety rules
6. If all checks pass, proceed to sign/send (or display for `--simulate-only`)

## Transfer Diff / Instruction Inspection

Before signing, compute and display the net effect:
- SOL balance change for the user wallet
- Token balance changes (in/out amounts)
- All destination addresses for outgoing transfers
- Fee amounts and destinations

### Known/expected addresses
- User's wallet
- User's ATAs (input token, output token)
- Jupiter program IDs
- DEX program IDs (from route info)
- Integrator fee account ATA
- System program, Token program, ATA program

### Fail closed
If any transfer goes to an address not in the known set, **reject the transaction** with a clear error showing the unknown address and transfer amount.

## Safety Guardrails

### Configurable limits (from `[safety]` config)
- `max_fee_bps` - Reject if integrator fee exceeds this
- `max_price_impact_bps` - Reject if price impact exceeds this
- `max_trade_sol` - Reject if trade size (in SOL terms) exceeds this
- `allowlist` - If set, reject swaps to output mints not on the list
- `rpc_allowlist` - If set, reject RPC endpoints not on the list

### Non-configurable safety rules
- Always simulate before broadcast (unless `--skip-simulation` explicitly passed)
- Re-quote if blockhash is expired (transaction would fail anyway)
- Require `--yes` flag for non-interactive execution (no silent auto-confirm)

## Agent Mode Hardening

When `--yes --json` is used (agent mode):
- All safety checks still apply (they're stricter, not looser)
- No interactive prompts — fail with structured error instead
- Structured error output with error codes (see cli-commands.md exit codes)
- Never accept unstructured/natural-language input as swap parameters

## Receipt Storage

After successful swap:
- Store receipt as JSONL in `receipts_dir` (default `~/.clawdex/receipts/`)
- Filename: `receipts.jsonl` (append-only)
- Each line is a JSON object with:
  - `timestamp` (ISO 8601)
  - `signature` (tx signature)
  - `input_mint`, `input_symbol`, `input_amount`
  - `output_mint`, `output_symbol`, `output_amount`
  - `fee_bps`, `fee_amount`, `fee_token`
  - `route` (array of venues)
  - `slot`, `block_time`
  - `success` (boolean)
  - `error` (if failed)

## Requirements

### Core Functionality
- Simulate every transaction before broadcast
- Parse simulation results for balance changes
- Compute transfer diff showing all movements
- Validate against configurable safety limits
- Store receipts for every attempted swap

### Behavior
- Human mode: display transfer diff as a table before confirmation
- Agent/JSON mode: include transfer diff in output
- `--simulate-only`: do everything except broadcast, output result
- Failed simulation: show clear error with log messages

### Error Handling
- Simulation failure: show program error logs
- Unknown transfer detected: show address and amount, suggest checking
- Safety limit exceeded: show which limit, actual vs configured max

## Acceptance Criteria

- [ ] Every swap simulates before broadcast
- [ ] Transfer diff shows all balance changes
- [ ] Unknown destination addresses cause rejection
- [ ] Safety limits are enforced (fee, price impact, trade size, allowlist)
- [ ] Receipts are stored for every swap attempt
- [ ] `--simulate-only` works without broadcasting
- [ ] Agent mode returns structured errors, never prompts
