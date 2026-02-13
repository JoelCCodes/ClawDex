import { Command } from 'commander';
import { Connection } from '@solana/web3.js';
import chalk from 'chalk';
import { resolveConfig } from '../core/config.js';
import { loadWallet } from '../core/wallet.js';
import { printResult, printError } from '../core/output.js';
import { OutputMode, EXIT_SUCCESS, EXIT_GENERAL } from '../types.js';
import { TOKEN_CACHE_FILE } from '../constants.js';
import { expandHome } from '../core/config.js';
import { existsSync, readFileSync } from 'fs';

interface StatusResult {
  rpc: { url: string; healthy: boolean; latency_ms: number | null };
  wallet: { configured: boolean; pubkey: string | null };
  fee_account: { configured: boolean; pubkey: string | null };
  token_list: { loaded: boolean; count: number | null };
}

export function statusCommand(): Command {
  const cmd = new Command('status')
    .description('Health check — verify RPC, wallet, and configuration')
    .option('--json', 'Output in JSON format')
    .option('--wallet <path>', 'Override wallet keypair path')
    .action(async (opts: { json?: boolean; wallet?: string }) => {
      const isJson = opts.json || cmd.parent?.opts().json;
      const mode = isJson ? OutputMode.Json : OutputMode.Human;
      let hasFailure = false;

      let config;
      try {
        config = resolveConfig(opts.wallet ? { wallet: opts.wallet } : {});
      } catch (err) {
        printError(err instanceof Error ? err : String(err), mode, EXIT_GENERAL);
        process.exit(EXIT_GENERAL);
      }

      const result: StatusResult = {
        rpc: { url: config.rpc, healthy: false, latency_ms: null },
        wallet: { configured: false, pubkey: null },
        fee_account: { configured: false, pubkey: null },
        token_list: { loaded: false, count: null },
      };

      // Check RPC connectivity
      try {
        const connection = new Connection(config.rpc);
        const start = performance.now();
        await connection.getSlot();
        const latency = Math.round(performance.now() - start);
        result.rpc.healthy = true;
        result.rpc.latency_ms = latency;
      } catch {
        hasFailure = true;
      }

      // Check wallet
      if (config.wallet) {
        result.wallet.configured = true;
        try {
          const keypair = loadWallet(config.wallet);
          result.wallet.pubkey = keypair.publicKey.toBase58();
        } catch {
          hasFailure = true;
        }
      } else {
        hasFailure = true;
      }

      // Check fee account
      if (config.fee_account) {
        result.fee_account.configured = true;
        result.fee_account.pubkey = config.fee_account;
      } else {
        hasFailure = true;
      }

      // Check token list cache
      try {
        const cachePath = expandHome(TOKEN_CACHE_FILE);
        if (existsSync(cachePath)) {
          const raw = readFileSync(cachePath, 'utf-8');
          const cache = JSON.parse(raw) as { timestamp: number; tokens: unknown[] };
          result.token_list.loaded = true;
          result.token_list.count = cache.tokens.length;
        }
      } catch {
        // Token cache not available
      }

      if (mode === OutputMode.Json) {
        printResult(result, mode);
      } else {
        const ok = chalk.green('OK');
        const fail = chalk.red('FAIL');
        const warn = chalk.yellow('WARN');

        const lines: string[] = [];
        lines.push(
          `${chalk.bold('RPC:')}     ${result.rpc.healthy ? ok : fail}  ${result.rpc.url}${result.rpc.latency_ms != null ? ` (${result.rpc.latency_ms}ms)` : ''}`,
        );
        lines.push(
          `${chalk.bold('Wallet:')}  ${result.wallet.configured ? (result.wallet.pubkey ? ok : fail) : fail}  ${result.wallet.pubkey ?? (config.wallet || 'not configured')}`,
        );
        lines.push(
          `${chalk.bold('Fee:')}     ${result.fee_account.configured ? ok : warn}  ${result.fee_account.pubkey ?? 'not configured'}`,
        );
        lines.push(
          `${chalk.bold('Tokens:')}  ${result.token_list.loaded ? ok : warn}  ${result.token_list.count != null ? `${result.token_list.count} tokens cached` : 'no cache'}`,
        );
        console.log(lines.join('\n'));
      }

      process.exit(hasFailure ? EXIT_GENERAL : EXIT_SUCCESS);
    });

  return cmd;
}
