import { Command } from 'commander';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { createAssociatedTokenAccountInstruction, getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token';
import chalk from 'chalk';
import { resolveConfig } from '../core/config.js';
import { loadWallet } from '../core/wallet.js';
import { createConnection } from '../core/connection.js';
import { printError } from '../core/output.js';
import { OutputMode, EXIT_CONFIG, EXIT_GENERAL, EXIT_SUCCESS } from '../types.js';
import { COMMON_FEE_MINTS } from '../constants.js';

export function setupFeesCommand(): Command {
  const cmd = new Command('setup-fees')
    .description('Pre-create fee token accounts for common tokens')
    .option('--wallet <path>', 'Payer wallet keypair (pays ATA rent ~0.002 SOL each)')
    .option('--json', 'Output in JSON format')
    .action(async (opts: { wallet?: string; json?: boolean }) => {
      const isJson = opts.json || cmd.parent?.opts().json;
      const mode = isJson ? OutputMode.Json : OutputMode.Human;

      let config;
      try {
        config = resolveConfig();
      } catch (err) {
        printError(err instanceof Error ? err : String(err), mode, EXIT_CONFIG);
        process.exit(EXIT_CONFIG);
      }

      const feeWallet = config.fee_account;
      if (!feeWallet) {
        printError('No fee_account configured. Set one with: clawdex config set fee_account=<pubkey>', mode, EXIT_CONFIG);
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

      const connection = createConnection(config.rpc, 'confirmed');
      const feeWalletPubkey = new PublicKey(feeWallet);
      const results: { symbol: string; mint: string; ata: string; status: string }[] = [];

      if (mode === OutputMode.Human) {
        console.log(chalk.bold(`Setting up fee accounts for wallet: ${feeWallet}\n`));
      }

      for (const token of COMMON_FEE_MINTS) {
        const mintPubkey = new PublicKey(token.mint);
        const ata = getAssociatedTokenAddressSync(mintPubkey, feeWalletPubkey);
        const ataStr = ata.toBase58();

        try {
          await getAccount(connection, ata);
          results.push({ symbol: token.symbol, mint: token.mint, ata: ataStr, status: 'exists' });
          if (mode === OutputMode.Human) {
            console.log(`  ${chalk.green('OK')}  ${token.symbol.padEnd(8)} ${ataStr} (already exists)`);
          }
        } catch {
          // ATA doesn't exist — create it
          try {
            const ix = createAssociatedTokenAccountInstruction(
              keypair.publicKey,
              ata,
              feeWalletPubkey,
              mintPubkey,
            );
            const tx = new Transaction().add(ix);
            tx.feePayer = keypair.publicKey;
            tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            tx.sign({ publicKey: keypair.publicKey, secretKey: keypair.secretKey });
            const sig = await connection.sendRawTransaction(tx.serialize());
            await connection.confirmTransaction(sig, 'confirmed');

            results.push({ symbol: token.symbol, mint: token.mint, ata: ataStr, status: 'created' });
            if (mode === OutputMode.Human) {
              console.log(`  ${chalk.green('NEW')} ${token.symbol.padEnd(8)} ${ataStr} (created)`);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            results.push({ symbol: token.symbol, mint: token.mint, ata: ataStr, status: `failed: ${msg}` });
            if (mode === OutputMode.Human) {
              console.log(`  ${chalk.red('ERR')} ${token.symbol.padEnd(8)} ${msg}`);
            }
          }
        }
      }

      if (mode === OutputMode.Json) {
        console.log(JSON.stringify({ success: true, fee_wallet: feeWallet, accounts: results }, null, 2));
      } else {
        const created = results.filter(r => r.status === 'created').length;
        const existing = results.filter(r => r.status === 'exists').length;
        const failed = results.filter(r => r.status.startsWith('failed')).length;
        console.log(`\n${chalk.bold('Done.')} ${created} created, ${existing} already existed, ${failed} failed.`);
      }

      process.exit(EXIT_SUCCESS);
    });

  return cmd;
}
