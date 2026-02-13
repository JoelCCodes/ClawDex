import { Command } from 'commander';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { loadWallet, generateWallet } from '../core/wallet.js';
import { resolveConfig, expandHome } from '../core/config.js';
import { printResult, printError } from '../core/output.js';
import { OutputMode, EXIT_SUCCESS, EXIT_GENERAL, EXIT_CONFIG } from '../types.js';

export function walletCommand(): Command {
  const cmd = new Command('wallet')
    .description('Wallet info and generation')
    .enablePositionalOptions()
    .passThroughOptions();

  // Default action: show wallet info
  cmd
    .option('--json', 'Output in JSON format')
    .option('--wallet <path>', 'Override wallet path')
    .action(async (opts: { json?: boolean; wallet?: string }) => {
      const isJson = opts.json || cmd.parent?.opts().json;
      const mode = isJson ? OutputMode.Json : OutputMode.Human;

      let config;
      try {
        config = resolveConfig(opts.wallet ? { wallet: opts.wallet } : {});
      } catch (err) {
        printError(err instanceof Error ? err : String(err), mode, EXIT_CONFIG);
        process.exit(EXIT_CONFIG);
      }

      if (!config.wallet) {
        printError('No wallet configured. Run `clawdex onboarding` or `clawdex config set wallet=<path>`.', mode, EXIT_GENERAL);
        process.exit(EXIT_GENERAL);
      }

      let keypair;
      try {
        keypair = loadWallet(config.wallet);
      } catch (err) {
        printError(err instanceof Error ? err : String(err), mode, EXIT_CONFIG);
        process.exit(EXIT_CONFIG);
      }

      const pubkey = keypair.publicKey.toBase58();
      let solBalance: number | null = null;

      try {
        const connection = new Connection(config.rpc);
        const lamports = await connection.getBalance(keypair.publicKey);
        solBalance = lamports / LAMPORTS_PER_SOL;
      } catch {
        // RPC may be unreachable — show what we can
      }

      const result = {
        pubkey,
        path: config.wallet,
        sol_balance: solBalance,
      };

      printResult(result, mode);
      process.exit(EXIT_SUCCESS);
    });

  // Subcommand: generate
  const genCmd = cmd.command('generate')
    .description('Generate a new Solana wallet keypair')
    .option('--output <path>', 'Output file path', '~/.clawdex/wallet.json')
    .option('--json', 'Output in JSON format')
    .action(async (opts: { output: string; json?: boolean }) => {
      const isJson = opts.json || cmd.opts().json || cmd.parent?.opts().json;
      const mode = isJson ? OutputMode.Json : OutputMode.Human;

      let keypair;
      try {
        keypair = generateWallet(opts.output);
      } catch (err) {
        printError(err instanceof Error ? err : String(err), mode, EXIT_CONFIG);
        process.exit(EXIT_CONFIG);
      }

      const result = {
        pubkey: keypair.publicKey.toBase58(),
        path: opts.output,
        generated: true,
      };

      printResult(result, mode);
      process.exit(EXIT_SUCCESS);
    });

  return cmd;
}
