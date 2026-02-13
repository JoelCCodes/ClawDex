import { Command } from 'commander';
import { setConfigValue } from '../core/config.js';
import { printResult, printError } from '../core/output.js';
import { OutputMode, EXIT_CONFIG, EXIT_SUCCESS } from '../types.js';

export function configCommand(): Command {
  const cmd = new Command('config')
    .description('Manage clawdex configuration')
    .enablePositionalOptions()
    .passThroughOptions();

  cmd
    .command('set')
    .description('Set configuration values')
    .argument('<pairs...>', 'key=value pairs (keys: rpc, wallet, fee_bps, fee_account, receipts_dir, jupiter_api_key)')
    .option('--json', 'Output in JSON format')
    .action((pairs: string[], opts: { json?: boolean }) => {
      const mode = opts.json ? OutputMode.Json : OutputMode.Human;
      const results: Array<{ key: string; value: string }> = [];

      for (const pair of pairs) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) {
          printError(`Invalid format: "${pair}". Expected key=value`, mode, EXIT_CONFIG);
          process.exit(EXIT_CONFIG);
        }

        const key = pair.slice(0, eqIdx);
        const value = pair.slice(eqIdx + 1);

        try {
          setConfigValue(key, value);
          results.push({ key, value });
        } catch (err) {
          printError(err instanceof Error ? err : String(err), mode, EXIT_CONFIG);
          process.exit(EXIT_CONFIG);
        }
      }

      printResult(
        mode === OutputMode.Json
          ? { success: true, updated: results }
          : results.map((r) => `${r.key} = ${r.value}`).join('\n'),
        mode,
      );
      process.exit(EXIT_SUCCESS);
    });

  return cmd;
}
