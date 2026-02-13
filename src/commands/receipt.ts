import { Command } from 'commander';
import chalk from 'chalk';
import { resolveConfig } from '../core/config.js';
import { lookupReceipt } from '../core/receipts.js';
import { printResult, printError } from '../core/output.js';
import { OutputMode, EXIT_SUCCESS, EXIT_GENERAL } from '../types.js';

export function receiptCommand(): Command {
  const cmd = new Command('receipt')
    .description('Look up a stored receipt by transaction signature')
    .argument('<txsig>', 'Transaction signature')
    .option('--json', 'Output in JSON format')
    .action(async (txsig: string, opts: { json?: boolean }) => {
      const isJson = opts.json || cmd.parent?.opts().json;
      const mode = isJson ? OutputMode.Json : OutputMode.Human;

      let config;
      try {
        config = resolveConfig();
      } catch (err) {
        printError(err instanceof Error ? err : String(err), mode, EXIT_GENERAL);
        process.exit(EXIT_GENERAL);
      }

      try {
        const receipt = await lookupReceipt(txsig, { receipts_dir: config.receipts_dir });

        if (!receipt) {
          printError(`Receipt not found for transaction: ${txsig}`, mode, EXIT_GENERAL);
          process.exit(EXIT_GENERAL);
        }

        if (mode === OutputMode.Json) {
          printResult(receipt, mode);
        } else {
          const lines: string[] = [];
          lines.push(chalk.bold('Receipt'));
          lines.push(`  ${chalk.bold('TX Signature:')} ${receipt.txSignature}`);
          lines.push(`  ${chalk.bold('Timestamp:')}    ${receipt.timestamp}`);
          lines.push(`  ${chalk.bold('Status:')}       ${receipt.status}`);
          lines.push(`  ${chalk.bold('Input:')}        ${receipt.inputAmount} ${receipt.inputToken.symbol} (${receipt.inputToken.mint})`);
          lines.push(`  ${chalk.bold('Output:')}       ${receipt.outputAmount} ${receipt.outputToken.symbol} (${receipt.outputToken.mint})`);
          lines.push(`  ${chalk.bold('Route:')}        ${receipt.route}`);

          if (receipt.fees.platformFeeBps != null) {
            lines.push(`  ${chalk.bold('Platform Fee:')} ${receipt.fees.platformFeeAmount ?? 'N/A'} (${receipt.fees.platformFeeBps} bps)`);
          }
          if (receipt.fees.networkFee != null) {
            lines.push(`  ${chalk.bold('Network Fee:')}  ${receipt.fees.networkFee} lamports`);
          }

          if (receipt.error) {
            lines.push(`  ${chalk.red('Error:')}        ${receipt.error}`);
          }

          console.log(lines.join('\n'));
        }

        process.exit(EXIT_SUCCESS);
      } catch (err) {
        printError(err instanceof Error ? err : String(err), mode, EXIT_GENERAL);
        process.exit(EXIT_GENERAL);
      }
    });

  return cmd;
}
