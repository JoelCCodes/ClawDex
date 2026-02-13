import { Command } from 'commander';
import { Connection } from '@solana/web3.js';
import chalk from 'chalk';
import { resolveConfig } from '../core/config.js';
import { loadWallet } from '../core/wallet.js';
import { resolveToken } from '../core/tokens.js';
import { printResult, printError, formatTable } from '../core/output.js';
import { OutputMode, EXIT_SUCCESS, EXIT_GENERAL } from '../types.js';
import { TOKEN_PROGRAM_ID } from '../constants.js';

export function balancesCommand(): Command {
  const cmd = new Command('balances')
    .description('Show SOL and token balances for the configured wallet')
    .option('--wallet <path>', 'Override wallet keypair path')
    .option('--json', 'Output in JSON format')
    .action(async (opts: { json?: boolean; wallet?: string }) => {
      const isJson = opts.json || cmd.parent?.opts().json;
      const mode = isJson ? OutputMode.Json : OutputMode.Human;

      let config;
      try {
        config = resolveConfig();
      } catch (err) {
        printError(err instanceof Error ? err : String(err), mode, EXIT_GENERAL);
        process.exit(EXIT_GENERAL);
      }

      const walletPath = opts.wallet ?? cmd.parent?.getOptionValue('wallet') as string | undefined ?? config.wallet;

      if (!walletPath) {
        printError('No wallet configured. Use --wallet or set via: clawdex config set wallet=<path>', mode, EXIT_GENERAL);
        process.exit(EXIT_GENERAL);
      }

      let wallet;
      try {
        wallet = loadWallet(walletPath);
      } catch (err) {
        printError(err instanceof Error ? err : String(err), mode, EXIT_GENERAL);
        process.exit(EXIT_GENERAL);
      }

      const connection = new Connection(config.rpc);

      try {
        // Fetch SOL balance
        const solLamports = await connection.getBalance(wallet.publicKey);
        const solBalance = solLamports / 1e9;

        // Fetch token accounts
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
          programId: TOKEN_PROGRAM_ID,
        });

        // Build results
        const balances: Array<{
          token: string;
          symbol: string;
          mint: string;
          balance: string;
          decimals: number;
        }> = [];

        // SOL entry
        balances.push({
          token: 'SOL',
          symbol: 'SOL',
          mint: 'So11111111111111111111111111111111',
          balance: solBalance.toString(),
          decimals: 9,
        });

        // Token accounts
        for (const account of tokenAccounts.value) {
          const parsed = account.account.data.parsed;
          const info = parsed.info as {
            mint: string;
            tokenAmount: { uiAmountString: string; decimals: number };
          };

          let symbol = info.mint;
          try {
            const tokenInfo = await resolveToken(info.mint);
            symbol = tokenInfo.symbol;
          } catch {
            // Use mint address as fallback
          }

          balances.push({
            token: symbol,
            symbol,
            mint: info.mint,
            balance: info.tokenAmount.uiAmountString,
            decimals: info.tokenAmount.decimals,
          });
        }

        if (mode === OutputMode.Json) {
          printResult(balances, mode);
        } else {
          const tableRows = balances.map((b) => ({
            Token: b.symbol,
            Balance: b.balance,
            Mint: b.mint,
          }));
          console.log(chalk.bold(`Wallet: ${wallet.publicKey.toBase58()}\n`));
          console.log(formatTable(tableRows, mode));
        }

        process.exit(EXIT_SUCCESS);
      } catch (err) {
        printError(err instanceof Error ? err : String(err), mode, EXIT_GENERAL);
        process.exit(EXIT_GENERAL);
      }
    });

  return cmd;
}
