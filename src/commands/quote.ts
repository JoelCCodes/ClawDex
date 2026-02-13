import { Command } from 'commander';
import chalk from 'chalk';
import { resolveConfig } from '../core/config.js';
import { resolveToken } from '../core/tokens.js';
import { getQuote, amountToSmallestUnit } from '../core/jupiter.js';
import { printResult, printError } from '../core/output.js';
import { OutputMode, EXIT_SUCCESS, EXIT_GENERAL } from '../types.js';
import { DEFAULT_SLIPPAGE_BPS } from '../constants.js';

export function quoteCommand(): Command {
  const cmd = new Command('quote')
    .description('Get a swap quote without executing')
    .requiredOption('--in <token>', 'Input token (symbol or mint address)')
    .requiredOption('--out <token>', 'Output token (symbol or mint address)')
    .requiredOption('--amount <number>', 'Amount of input token')
    .option('--slippage-bps <number>', 'Slippage tolerance in basis points')
    .option('--fee-bps <number>', 'Integrator fee in basis points')
    .option('--json', 'Output in JSON format')
    .action(async (opts: {
      in: string;
      out: string;
      amount: string;
      slippageBps?: string;
      feeBps?: string;
      json?: boolean;
    }) => {
      const isJson = opts.json || cmd.parent?.opts().json;
      const mode = isJson ? OutputMode.Json : OutputMode.Human;

      let config;
      try {
        config = resolveConfig();
      } catch (err) {
        printError(err instanceof Error ? err : String(err), mode, EXIT_GENERAL);
        process.exit(EXIT_GENERAL);
      }

      const amount = Number(opts.amount);
      if (isNaN(amount) || amount <= 0) {
        printError('--amount must be a positive number', mode, EXIT_GENERAL);
        process.exit(EXIT_GENERAL);
      }

      const slippageBps = opts.slippageBps != null ? Number(opts.slippageBps) : DEFAULT_SLIPPAGE_BPS;
      const feeBps = opts.feeBps != null ? Number(opts.feeBps) : config.fee_bps;

      try {
        // Resolve tokens
        const inputToken = await resolveToken(opts.in);
        const outputToken = await resolveToken(opts.out);

        // Convert amount to smallest unit
        const amountSmallest = amountToSmallestUnit(amount, inputToken.decimals);

        // Get quote
        const quote = await getQuote({
          inputMint: inputToken.mint,
          outputMint: outputToken.mint,
          amount: amountSmallest,
          slippageBps,
          platformFeeBps: feeBps > 0 ? feeBps : undefined,
        });

        if (mode === OutputMode.Json) {
          // Build structured JSON output per spec
          const outAmountHuman = Number(quote.outAmount) / 10 ** outputToken.decimals;
          const minAmountHuman = Number(quote.otherAmountThreshold) / 10 ** outputToken.decimals;

          const route = quote.routePlan.map((step) => ({
            venue: step.swapInfo.label ?? step.swapInfo.ammKey,
            percent: step.percent,
          }));

          const result = {
            input: {
              mint: inputToken.mint,
              symbol: inputToken.symbol,
              amount: opts.amount,
            },
            output: {
              mint: outputToken.mint,
              symbol: outputToken.symbol,
              amount: outAmountHuman.toString(),
              min_amount: minAmountHuman.toString(),
            },
            price_impact_bps: Math.round(parseFloat(quote.priceImpactPct) * 100),
            slippage_bps: quote.slippageBps,
            route,
            fees: {
              integrator_fee_bps: quote.platformFee?.feeBps ?? 0,
              integrator_fee_amount: quote.platformFee
                ? (Number(quote.platformFee.amount) / 10 ** outputToken.decimals).toString()
                : '0',
              integrator_fee_token: outputToken.symbol,
            },
          };

          printResult(result, mode);
        } else {
          // Human-readable output
          const outAmountHuman = Number(quote.outAmount) / 10 ** outputToken.decimals;
          const minAmountHuman = Number(quote.otherAmountThreshold) / 10 ** outputToken.decimals;
          const priceImpact = quote.priceImpactPct;

          const route = quote.routePlan
            .map((step) => `${step.swapInfo.label ?? step.swapInfo.ammKey} (${step.percent}%)`)
            .join(' -> ');

          const lines: string[] = [];
          lines.push(chalk.bold('Swap Quote'));
          lines.push(`  ${chalk.bold('Input:')}   ${amount} ${inputToken.symbol}`);
          lines.push(`  ${chalk.bold('Output:')}  ${outAmountHuman} ${outputToken.symbol}`);
          lines.push(`  ${chalk.bold('Minimum:')} ${minAmountHuman} ${outputToken.symbol}`);
          lines.push(`  ${chalk.bold('Route:')}   ${route}`);
          lines.push(`  ${chalk.bold('Impact:')}  ${priceImpact}%`);
          lines.push(`  ${chalk.bold('Slippage:')} ${quote.slippageBps} bps`);

          if (quote.platformFee) {
            const feeAmount = Number(quote.platformFee.amount) / 10 ** outputToken.decimals;
            lines.push(`  ${chalk.bold('Fee:')}     ${feeAmount} ${outputToken.symbol} (${quote.platformFee.feeBps} bps)`);
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
