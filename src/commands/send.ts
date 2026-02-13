import { Command } from 'commander';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from '@solana/spl-token';
import chalk from 'chalk';
import { resolveConfig } from '../core/config.js';
import { loadWallet } from '../core/wallet.js';
import { createConnection } from '../core/connection.js';
import { resolveToken, isValidBase58 } from '../core/tokens.js';
import { amountToSmallestUnit } from '../core/jupiter.js';
import { simulateAndDiff, formatTransferDiff } from '../core/simulate.js';
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
import { SOL_MINT } from '../constants.js';
import { createInterface } from 'readline';

/** Prompt the user for yes/no confirmation. Returns true if confirmed. */
async function promptConfirmation(message: string): Promise<boolean> {
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

/** Build a receipt for the send operation. */
function buildSendReceipt(params: {
  token: TokenInfo;
  amount: string;
  recipient: string;
  networkFee?: number;
  txSignature: string;
  transferDiff?: TransferDiff;
  status: 'success' | 'failed' | 'simulated';
  error?: string;
}): Receipt {
  return {
    timestamp: new Date().toISOString(),
    txSignature: params.txSignature,
    inputToken: params.token,
    outputToken: params.token,
    inputAmount: params.amount,
    outputAmount: params.amount,
    route: params.recipient,
    fees: {
      networkFee: params.networkFee,
    },
    transferDiff: params.transferDiff,
    status: params.status,
    error: params.error,
  };
}

export function sendCommand(): Command {
  const cmd = new Command('send')
    .description('Send SOL or any SPL token to a recipient')
    .requiredOption('--to <address>', 'Recipient wallet address')
    .requiredOption('--token <symbol|mint>', 'Token to send (SOL, USDC, or mint address)')
    .requiredOption('--amount <number>', 'Amount to send')
    .option('--yes', 'Skip confirmation prompt')
    .option('--json', 'Output in JSON format')
    .option('--simulate-only', 'Simulate without broadcasting')
    .option('--wallet <path>', 'Override wallet keypair path')
    .action(async (opts: {
      to: string;
      token: string;
      amount: string;
      yes?: boolean;
      json?: boolean;
      simulateOnly?: boolean;
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

      // Validate amount
      const amount = Number(opts.amount);
      if (isNaN(amount) || amount <= 0) {
        printError('--amount must be a positive number', mode, EXIT_GENERAL);
        process.exit(EXIT_GENERAL);
      }

      // Validate recipient address
      if (!isValidBase58(opts.to)) {
        printError('--to must be a valid Solana address', mode, EXIT_GENERAL);
        process.exit(EXIT_GENERAL);
      }

      // Non-TTY without --yes: reject for agent safety (simulation-only is safe)
      if (!opts.yes && !opts.simulateOnly && !process.stdin.isTTY) {
        printError('Non-interactive mode requires --yes flag', mode, EXIT_GENERAL);
        process.exit(EXIT_GENERAL);
      }

      let token: TokenInfo;

      try {
        // Step 1: Resolve token
        const apiKey = config.jupiter_api_key || undefined;
        token = await resolveToken(opts.token, apiKey);

        // Step 2: Safety check — max_trade_sol for SOL sends
        if (token.mint === SOL_MINT && config.safety.max_trade_sol != null) {
          if (amount > config.safety.max_trade_sol) {
            const errorMsg = `Safety check failed: send amount ${amount} SOL exceeds max_trade_sol ${config.safety.max_trade_sol}`;

            const receipt = buildSendReceipt({
              token,
              amount: opts.amount,
              recipient: opts.to,
              txSignature: '',
              status: 'failed',
              error: errorMsg,
            });
            await storeReceipt(receipt, { receipts_dir: config.receipts_dir });

            if (mode === OutputMode.Json) {
              printResult({
                success: false,
                error: 'SAFETY_CHECK_FAILED',
                message: errorMsg,
                violations: [`send amount ${amount} SOL exceeds max_trade_sol ${config.safety.max_trade_sol}`],
              }, mode);
            } else {
              printError(errorMsg, mode, EXIT_SAFETY);
            }
            process.exit(EXIT_SAFETY);
          }
        }

        // Step 3: Build transaction
        const connection = createConnection(config.rpc, 'confirmed');
        const recipientPubkey = new PublicKey(opts.to);
        const transaction = new Transaction();

        const isSol = token.mint === SOL_MINT;
        const amountRaw = BigInt(amountToSmallestUnit(amount, token.decimals));

        if (isSol) {
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: keypair.publicKey,
              toPubkey: recipientPubkey,
              lamports: amountRaw,
            }),
          );
        } else {
          // SPL token transfer
          const mintPubkey = new PublicKey(token.mint);
          const senderAta = getAssociatedTokenAddressSync(mintPubkey, keypair.publicKey);
          const recipientAta = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey, true);

          // Check if recipient ATA exists; create if missing
          try {
            await getAccount(connection, recipientAta);
          } catch {
            transaction.add(
              createAssociatedTokenAccountInstruction(
                keypair.publicKey,  // payer
                recipientAta,       // ATA to create
                recipientPubkey,    // owner
                mintPubkey,         // mint
              ),
            );
          }

          transaction.add(
            createTransferInstruction(
              senderAta,
              recipientAta,
              keypair.publicKey,
              amountRaw,
            ),
          );
        }

        // Set transaction metadata
        transaction.feePayer = keypair.publicKey;
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

        // Step 4: Simulate
        let diff: TransferDiff | undefined;
        try {
          diff = await simulateAndDiff(connection, transaction, keypair.publicKey);

          // Enrich token changes with symbol
          for (const tc of diff.tokenChanges) {
            if (tc.mint === token.mint) tc.symbol = token.symbol;
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);

          const receipt = buildSendReceipt({
            token,
            amount: opts.amount,
            recipient: opts.to,
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

        // --simulate-only: stop here
        if (opts.simulateOnly) {
          const receipt = buildSendReceipt({
            token,
            amount: opts.amount,
            recipient: opts.to,
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
              from: keypair.publicKey.toBase58(),
              to: opts.to,
              token: { symbol: token.symbol, mint: token.mint, amount: opts.amount },
              transferDiff: diff,
              networkFee: diff?.feeAmount ? diff.feeAmount / 1e9 : undefined,
              signature: null,
            }, mode);
          } else {
            console.log(chalk.bold('Simulation Result'));
            console.log(`  ${chalk.bold('From:')}  ${keypair.publicKey.toBase58()}`);
            console.log(`  ${chalk.bold('To:')}    ${opts.to}`);
            console.log(`  ${chalk.bold('Token:')} ${amount} ${token.symbol}`);
            if (diff) {
              console.log(chalk.bold('\nTransfer Summary:'));
              console.log(formatTransferDiff(diff));
            }
          }
          process.exit(EXIT_SUCCESS);
        }

        // Step 5: Display summary and prompt
        if (mode === OutputMode.Human) {
          console.log(chalk.bold('Send Summary'));
          console.log(`  ${chalk.bold('From:')}  ${keypair.publicKey.toBase58()}`);
          console.log(`  ${chalk.bold('To:')}    ${opts.to}`);
          console.log(`  ${chalk.bold('Token:')} ${amount} ${token.symbol}`);
          if (diff) {
            console.log(chalk.bold('\nTransfer Summary:'));
            console.log(formatTransferDiff(diff));
          }
        }

        if (!opts.yes) {
          const confirmed = await promptConfirmation('\nProceed with send? (y/N) ');
          if (!confirmed) {
            if (mode === OutputMode.Json) {
              printResult({ success: false, error: 'USER_CANCELLED', message: 'Send cancelled by user' }, mode);
            } else {
              console.log('Send cancelled.');
            }
            process.exit(EXIT_GENERAL);
          }
        }

        // Step 6: Sign and send
        try {
          transaction.sign(keypair);
          const signature = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: true,
            maxRetries: 2,
          });

          // Step 7: Confirm
          const confirmation = await connection.confirmTransaction(signature, 'confirmed');

          if (confirmation.value.err) {
            const errorMsg = `Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`;

            const receipt = buildSendReceipt({
              token,
              amount: opts.amount,
              recipient: opts.to,
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

          // Step 8: Success — store receipt
          const receipt = buildSendReceipt({
            token,
            amount: opts.amount,
            recipient: opts.to,
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
              from: keypair.publicKey.toBase58(),
              to: opts.to,
              token: { symbol: token.symbol, mint: token.mint, amount: opts.amount },
              networkFee: diff?.feeAmount ? diff.feeAmount / 1e9 : undefined,
            }, mode);
          } else {
            console.log(chalk.green('\nSend successful!'));
            console.log(`  ${chalk.bold('Signature:')} ${signature}`);
          }

          process.exit(EXIT_SUCCESS);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);

          const receipt = buildSendReceipt({
            token,
            amount: opts.amount,
            recipient: opts.to,
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
