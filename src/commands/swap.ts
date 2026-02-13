import { Command } from 'commander';
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { createAssociatedTokenAccountInstruction, getAccount } from '@solana/spl-token';
import chalk from 'chalk';
import { resolveConfig } from '../core/config.js';
import { loadWallet } from '../core/wallet.js';
import { createConnection } from '../core/connection.js';
import { resolveToken } from '../core/tokens.js';
import { getQuote, getSwapTransaction, amountToSmallestUnit, deriveFeeAta } from '../core/jupiter.js';
import { validateSafety } from '../core/safety.js';
import {
  simulateAndDiff,
  buildKnownAddresses,
  validateTransfers,
  formatTransferDiff,
} from '../core/simulate.js';
import { storeReceipt } from '../core/receipts.js';
import { printResult, printError } from '../core/output.js';
import {
  OutputMode,
  EXIT_SUCCESS,
  EXIT_GENERAL,
  EXIT_SAFETY,
  EXIT_SIMULATION,
  EXIT_SEND,
  EXIT_CONFIG,
} from '../types.js';
import type { Receipt, TokenInfo, TransferDiff } from '../types.js';
import { DEFAULT_SLIPPAGE_BPS } from '../constants.js';
import { createInterface } from 'readline';

/** Build a route description string from a quote's routePlan. */
function buildRouteString(routePlan: { swapInfo: { label?: string; ammKey: string }; percent: number }[]): string {
  return routePlan
    .map((step) => `${step.swapInfo.label ?? step.swapInfo.ammKey} (${step.percent}%)`)
    .join(' -> ');
}

/** Build a receipt from the current swap state. */
function buildReceipt(params: {
  inputToken: TokenInfo;
  outputToken: TokenInfo;
  inputAmount: string;
  outputAmount: string;
  route: string;
  platformFeeBps?: number;
  platformFeeAmount?: string;
  networkFee?: number;
  txSignature: string;
  transferDiff?: TransferDiff;
  status: 'success' | 'failed' | 'simulated';
  error?: string;
}): Receipt {
  return {
    timestamp: new Date().toISOString(),
    txSignature: params.txSignature,
    inputToken: params.inputToken,
    outputToken: params.outputToken,
    inputAmount: params.inputAmount,
    outputAmount: params.outputAmount,
    route: params.route,
    fees: {
      platformFeeBps: params.platformFeeBps,
      platformFeeAmount: params.platformFeeAmount,
      networkFee: params.networkFee,
    },
    transferDiff: params.transferDiff,
    status: params.status,
    error: params.error,
  };
}

/** Prompt the user for yes/no confirmation. Returns true if confirmed. */
async function promptConfirmation(message: string): Promise<boolean> {
  // Non-TTY stdin: reject for agent safety
  if (!process.stdin.isTTY) {
    return false;
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

/** Ensure the fee ATA exists on-chain, creating it if needed. */
async function ensureFeeAta(
  connection: Connection,
  payer: { publicKey: PublicKey; secretKey: Uint8Array },
  feeWallet: string,
  mint: string,
  feeAtaAddress: string,
): Promise<void> {
  const feeAtaPubkey = new PublicKey(feeAtaAddress);
  try {
    await getAccount(connection, feeAtaPubkey);
    // ATA already exists
  } catch {
    // ATA doesn't exist — create it
    const ix = createAssociatedTokenAccountInstruction(
      payer.publicKey,        // payer
      feeAtaPubkey,           // ATA to create
      new PublicKey(feeWallet), // owner of the ATA
      new PublicKey(mint),    // token mint
    );
    const tx = new Transaction().add(ix);
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.sign({ publicKey: payer.publicKey, secretKey: payer.secretKey });
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig, 'confirmed');
  }
}

export function swapCommand(): Command {
  const cmd = new Command('swap')
    .description('Execute a token swap via Jupiter')
    .requiredOption('--in <token>', 'Input token (symbol or mint address)')
    .requiredOption('--out <token>', 'Output token (symbol or mint address)')
    .requiredOption('--amount <number>', 'Amount of input token')
    .option('--slippage-bps <number>', 'Slippage tolerance in basis points')
    .option('--fee-bps <number>', 'Integrator fee in basis points')
    .option('--yes', 'Skip confirmation prompt')
    .option('--json', 'Output in JSON format')
    .option('--simulate-only', 'Simulate but do not broadcast')
    .option('--skip-simulation', 'Skip simulation before broadcast (dangerous)')
    .option('--wallet <path>', 'Override wallet keypair path')
    .action(async (opts: {
      in: string;
      out: string;
      amount: string;
      slippageBps?: string;
      feeBps?: string;
      yes?: boolean;
      json?: boolean;
      simulateOnly?: boolean;
      skipSimulation?: boolean;
      wallet?: string;
    }) => {
      const isJson = opts.json || cmd.parent?.opts().json;
      const mode = isJson ? OutputMode.Json : OutputMode.Human;

      // Step 0: Resolve config and wallet
      let config;
      try {
        config = resolveConfig();
      } catch (err) {
        printError(err instanceof Error ? err : String(err), mode, EXIT_CONFIG);
        process.exit(EXIT_CONFIG);
      }

      const walletPath = opts.wallet ?? cmd.parent?.getOptionValue('wallet') as string | undefined ?? config.wallet;

      if (!walletPath) {
        printError('No wallet configured. Use --wallet or set via: clawdex config set wallet=<path>', mode, EXIT_CONFIG);
        process.exit(EXIT_CONFIG);
      }

      let keypair;
      try {
        keypair = loadWallet(walletPath);
      } catch (err) {
        printError(err instanceof Error ? err : String(err), mode, EXIT_CONFIG);
        process.exit(EXIT_CONFIG);
      }

      const amount = Number(opts.amount);
      if (isNaN(amount) || amount <= 0) {
        printError('--amount must be a positive number', mode, EXIT_GENERAL);
        process.exit(EXIT_GENERAL);
      }

      const slippageBps = opts.slippageBps != null ? Number(opts.slippageBps) : DEFAULT_SLIPPAGE_BPS;
      const feeBps = opts.feeBps != null ? Number(opts.feeBps) : config.fee_bps;

      // Non-TTY without --yes: reject for agent safety (simulation-only is safe)
      if (!opts.yes && !opts.simulateOnly && !process.stdin.isTTY) {
        printError('Non-interactive mode requires --yes flag', mode, EXIT_GENERAL);
        process.exit(EXIT_GENERAL);
      }

      let inputToken: TokenInfo;
      let outputToken: TokenInfo;
      let routeString = '';

      try {
        // Step 1: Resolve tokens
        const apiKey = config.jupiter_api_key || undefined;
        inputToken = await resolveToken(opts.in, apiKey);
        outputToken = await resolveToken(opts.out, apiKey);

        // Step 2: Get quote
        const amountSmallest = amountToSmallestUnit(amount, inputToken.decimals);
        const quote = await getQuote({
          inputMint: inputToken.mint,
          outputMint: outputToken.mint,
          amount: amountSmallest,
          slippageBps,
          platformFeeBps: feeBps > 0 ? feeBps : undefined,
          apiKey,
        });

        routeString = buildRouteString(quote.routePlan);
        const outAmountHuman = Number(quote.outAmount) / 10 ** outputToken.decimals;

        // Step 3: Safety checks
        const safetyResult = validateSafety(quote, config.safety);
        if (!safetyResult.safe) {
          const errorMsg = `Safety check failed: ${safetyResult.violations.join('; ')}`;

          // Store receipt for safety failure
          const receipt = buildReceipt({
            inputToken,
            outputToken,
            inputAmount: opts.amount,
            outputAmount: outAmountHuman.toString(),
            route: routeString,
            platformFeeBps: quote.platformFee?.feeBps,
            platformFeeAmount: quote.platformFee?.amount,
            txSignature: '',
            status: 'failed',
            error: errorMsg,
          });
          await storeReceipt(receipt, { receipts_dir: config.receipts_dir });

          if (mode === OutputMode.Json) {
            printResult({ success: false, error: 'SAFETY_CHECK_FAILED', message: errorMsg, violations: safetyResult.violations }, mode);
          } else {
            printError(errorMsg, mode, EXIT_SAFETY);
          }
          process.exit(EXIT_SAFETY);
        }

        // Step 4: Get swap transaction
        // Derive the fee token account (ATA) from the fee wallet + output mint.
        // Jupiter requires a token account, not a raw wallet address.
        const connection = createConnection(config.rpc, 'confirmed');
        const feeWallet = config.fee_account || undefined;
        let feeAccount: string | undefined;
        if (feeWallet && feeBps > 0) {
          const feeAtaAddress = deriveFeeAta(feeWallet, outputToken.mint);
          try {
            await getAccount(connection, new PublicKey(feeAtaAddress));
            feeAccount = feeAtaAddress;
          } catch {
            // Fee ATA doesn't exist — auto-create if enabled, otherwise skip fee
            if (config.auto_create_fee_ata) {
              await ensureFeeAta(connection, keypair, feeWallet, outputToken.mint, feeAtaAddress);
              feeAccount = feeAtaAddress;
            }
            // else: silently skip fee for this token
          }
        }
        const { swapTransaction: swapTxBase64, lastValidBlockHeight } = await getSwapTransaction({
          quoteResponse: quote,
          userPublicKey: keypair.publicKey.toBase58(),
          feeAccount,
          apiKey,
        });

        // Deserialize the versioned transaction
        const txBuffer = Buffer.from(swapTxBase64, 'base64');
        const transaction = VersionedTransaction.deserialize(txBuffer);
        let diff: TransferDiff | undefined;

        // Step 5: Simulate (unless --skip-simulation)
        if (opts.skipSimulation) {
          if (mode === OutputMode.Human) {
            console.error(chalk.yellow('WARNING: Skipping simulation. Transfer validation will not be performed.'));
          }
        } else {
          try {
            diff = await simulateAndDiff(connection, transaction, keypair.publicKey);

            // Enrich token changes with symbols from the resolved tokens
            for (const tc of diff.tokenChanges) {
              if (tc.mint === inputToken.mint) tc.symbol = inputToken.symbol;
              else if (tc.mint === outputToken.mint) tc.symbol = outputToken.symbol;
            }

            // Validate transfers against known addresses
            const tokenMints = [inputToken.mint, outputToken.mint];
            const knownAddresses = buildKnownAddresses(keypair.publicKey, feeWallet, tokenMints);

            // Add DEX program IDs from the route plan
            for (const step of quote.routePlan) {
              knownAddresses.add(step.swapInfo.ammKey);
            }

            const transferValidation = validateTransfers(diff, knownAddresses);
            if (!transferValidation.safe) {
              const errorMsg = `Unknown transfer destinations detected: ${transferValidation.unknownAddresses.join(', ')}`;

              // Store receipt for transfer validation failure
              const receipt = buildReceipt({
                inputToken,
                outputToken,
                inputAmount: opts.amount,
                outputAmount: outAmountHuman.toString(),
                route: routeString,
                platformFeeBps: quote.platformFee?.feeBps,
                platformFeeAmount: quote.platformFee?.amount,
                networkFee: diff.feeAmount,
                txSignature: '',
                transferDiff: diff,
                status: 'failed',
                error: errorMsg,
              });
              await storeReceipt(receipt, { receipts_dir: config.receipts_dir });

              if (mode === OutputMode.Json) {
                printResult({
                  success: false,
                  error: 'UNKNOWN_TRANSFER',
                  message: errorMsg,
                  unknownAddresses: transferValidation.unknownAddresses,
                }, mode);
              } else {
                printError(errorMsg, mode, EXIT_SAFETY);
              }
              process.exit(EXIT_SAFETY);
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);

            // Store receipt for simulation failure
            const receipt = buildReceipt({
              inputToken,
              outputToken,
              inputAmount: opts.amount,
              outputAmount: outAmountHuman.toString(),
              route: routeString,
              platformFeeBps: quote.platformFee?.feeBps,
              platformFeeAmount: quote.platformFee?.amount,
              txSignature: '',
              status: 'failed',
              error: errorMsg,
            });
            await storeReceipt(receipt, { receipts_dir: config.receipts_dir });

            if (mode === OutputMode.Json) {
              printResult({ success: false, error: 'SIMULATION_FAILED', message: errorMsg }, mode);
            } else {
              printError(errorMsg, mode, EXIT_SIMULATION);
            }
            process.exit(EXIT_SIMULATION);
          }
        }

        // --simulate-only: stop here
        if (opts.simulateOnly) {
          const receipt = buildReceipt({
            inputToken,
            outputToken,
            inputAmount: opts.amount,
            outputAmount: outAmountHuman.toString(),
            route: routeString,
            platformFeeBps: quote.platformFee?.feeBps,
            platformFeeAmount: quote.platformFee?.amount,
            networkFee: diff?.feeAmount,
            txSignature: '',
            transferDiff: diff,
            status: 'simulated',
          });
          await storeReceipt(receipt, { receipts_dir: config.receipts_dir });

          if (mode === OutputMode.Json) {
            printResult({
              success: true,
              simulated: true,
              input: { mint: inputToken.mint, symbol: inputToken.symbol, amount: opts.amount },
              output: { mint: outputToken.mint, symbol: outputToken.symbol, amount: outAmountHuman.toString() },
              route: quote.routePlan.map((s) => ({ venue: s.swapInfo.label ?? s.swapInfo.ammKey, percent: s.percent })),
              transferDiff: diff,
              signature: null,
              slot: null,
              block_time: null,
            }, mode);
          } else {
            console.log(chalk.bold('Simulation Result'));
            console.log(`  ${chalk.bold('Input:')}  ${amount} ${inputToken.symbol}`);
            console.log(`  ${chalk.bold('Output:')} ${outAmountHuman} ${outputToken.symbol}`);
            console.log(`  ${chalk.bold('Route:')}  ${routeString}`);
            if (diff) {
              console.log(chalk.bold('\nTransfer Summary:'));
              console.log(formatTransferDiff(diff));
            }
          }
          process.exit(EXIT_SUCCESS);
        }

        // Step 6: Display transfer summary and prompt
        if (mode === OutputMode.Human) {
          console.log(chalk.bold('Swap Summary'));
          console.log(`  ${chalk.bold('Input:')}  ${amount} ${inputToken.symbol}`);
          console.log(`  ${chalk.bold('Output:')} ~${outAmountHuman} ${outputToken.symbol}`);
          console.log(`  ${chalk.bold('Route:')}  ${routeString}`);
          console.log(`  ${chalk.bold('Slippage:')} ${slippageBps} bps`);
          console.log(`  ${chalk.bold('Impact:')} ${quote.priceImpactPct}%`);
          if (quote.platformFee) {
            const feeAmount = Number(quote.platformFee.amount) / 10 ** outputToken.decimals;
            console.log(`  ${chalk.bold('Fee:')} ${feeAmount} ${outputToken.symbol} (${quote.platformFee.feeBps} bps)`);
          }
          if (diff) {
            console.log(chalk.bold('\nTransfer Summary:'));
            console.log(formatTransferDiff(diff));
          }
        }

        if (!opts.yes) {
          const confirmed = await promptConfirmation('\nProceed with swap? (y/N) ');
          if (!confirmed) {
            if (mode === OutputMode.Json) {
              printResult({ success: false, error: 'USER_CANCELLED', message: 'Swap cancelled by user' }, mode);
            } else {
              console.log('Swap cancelled.');
            }
            process.exit(EXIT_GENERAL);
          }
        }

        // Step 7: Sign and send
        try {
          transaction.sign([keypair]);
          const rawTx = transaction.serialize();
          const signature = await connection.sendRawTransaction(rawTx, {
            skipPreflight: true,
            maxRetries: 2,
          });

          // Step 8: Confirm
          const confirmation = await connection.confirmTransaction(
            { signature, blockhash: transaction.message.recentBlockhash, lastValidBlockHeight },
            'confirmed',
          );

          if (confirmation.value.err) {
            const errorMsg = `Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`;

            const receipt = buildReceipt({
              inputToken,
              outputToken,
              inputAmount: opts.amount,
              outputAmount: outAmountHuman.toString(),
              route: routeString,
              platformFeeBps: quote.platformFee?.feeBps,
              platformFeeAmount: quote.platformFee?.amount,
              networkFee: diff?.feeAmount,
              txSignature: signature,
              transferDiff: diff,
              status: 'failed',
              error: errorMsg,
            });
            await storeReceipt(receipt, { receipts_dir: config.receipts_dir });

            if (mode === OutputMode.Json) {
              printResult({ success: false, error: 'TRANSACTION_FAILED', message: errorMsg, signature }, mode);
            } else {
              printError(errorMsg, mode, EXIT_SEND);
            }
            process.exit(EXIT_SEND);
          }

          // Success
          const receipt = buildReceipt({
            inputToken,
            outputToken,
            inputAmount: opts.amount,
            outputAmount: outAmountHuman.toString(),
            route: routeString,
            platformFeeBps: quote.platformFee?.feeBps,
            platformFeeAmount: quote.platformFee?.amount,
            networkFee: diff?.feeAmount,
            txSignature: signature,
            transferDiff: diff,
            status: 'success',
          });
          await storeReceipt(receipt, { receipts_dir: config.receipts_dir });

          if (mode === OutputMode.Json) {
            printResult({
              success: true,
              signature,
              input: { mint: inputToken.mint, symbol: inputToken.symbol, amount: opts.amount },
              output: { mint: outputToken.mint, symbol: outputToken.symbol, amount: outAmountHuman.toString() },
              fees: {
                integrator_fee_bps: quote.platformFee?.feeBps ?? 0,
                integrator_fee_amount: quote.platformFee
                  ? (Number(quote.platformFee.amount) / 10 ** outputToken.decimals).toString()
                  : '0',
              },
              route: quote.routePlan.map((s) => ({ venue: s.swapInfo.label ?? s.swapInfo.ammKey, percent: s.percent })),
            }, mode);
          } else {
            console.log(chalk.green('\nSwap successful!'));
            console.log(`  ${chalk.bold('Signature:')} ${signature}`);
          }

          process.exit(EXIT_SUCCESS);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);

          const receipt = buildReceipt({
            inputToken,
            outputToken,
            inputAmount: opts.amount,
            outputAmount: outAmountHuman.toString(),
            route: routeString,
            platformFeeBps: quote.platformFee?.feeBps,
            platformFeeAmount: quote.platformFee?.amount,
            networkFee: diff?.feeAmount,
            txSignature: '',
            transferDiff: diff,
            status: 'failed',
            error: errorMsg,
          });
          await storeReceipt(receipt, { receipts_dir: config.receipts_dir });

          if (mode === OutputMode.Json) {
            printResult({ success: false, error: 'SEND_FAILED', message: errorMsg }, mode);
          } else {
            printError(errorMsg, mode, EXIT_SEND);
          }
          process.exit(EXIT_SEND);
        }
      } catch (err) {
        printError(err instanceof Error ? err : String(err), mode, EXIT_GENERAL);
        process.exit(EXIT_GENERAL);
      }
    });

  return cmd;
}
