import { Command } from 'commander';
import { Connection } from '@solana/web3.js';
import { createInterface } from 'readline';
import { loadConfig, setConfigValue, setSafetyValue, expandHome } from '../core/config.js';
import { loadWallet, generateWallet } from '../core/wallet.js';
import { fetchTokenList } from '../core/tokens.js';
import { printResult, printError } from '../core/output.js';
import { OutputMode, EXIT_SUCCESS, EXIT_CONFIG } from '../types.js';
import { DEFAULT_RPC } from '../constants.js';

interface OnboardingResult {
  success: boolean;
  config: {
    jupiter_api_key: string;
    rpc: string;
    wallet: string;
    wallet_pubkey: string;
    wallet_generated: boolean;
    fee_bps: number;
    fee_account: string;
    auto_create_fee_ata: boolean;
    receipts_dir: string;
  };
  validation: {
    jupiter_api_key: { valid: boolean; token_count: number | null; error?: string };
    rpc: { healthy: boolean; latency_ms: number | null; error?: string };
    wallet: { valid: boolean; pubkey: string | null; error?: string };
    config_written: boolean;
  };
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return '***';
  return key.slice(0, 3) + '***' + key.slice(-4);
}

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

export function onboardingCommand(): Command {
  const cmd = new Command('onboarding')
    .description('Configure ClawDex in one step — API key, RPC, wallet, and safety guardrails')
    .option('--jupiter-api-key <key>', 'Jupiter API key')
    .option('--rpc <url>', 'Solana RPC endpoint')
    .option('--wallet <path>', 'Path to existing keypair JSON')
    .option('--generate-wallet', 'Generate a new wallet instead')
    .option('--wallet-output <path>', 'Where to save generated wallet', '~/.clawdex/wallet.json')
    .option('--fee-bps <n>', 'Platform fee bps')
    .option('--fee-account <pubkey>', 'Fee wallet pubkey')
    .option('--auto-create-fee-ata <bool>', 'Auto-create fee ATAs')
    .option('--receipts-dir <path>', 'Receipt log dir')
    .option('--max-slippage-bps <n>', 'Safety: max slippage bps')
    .option('--max-trade-sol <n>', 'Safety: max trade size in SOL')
    .option('--max-price-impact-bps <n>', 'Safety: max price impact bps')
    .option('--json', 'Structured JSON output')
    .action(async (opts) => {
      const isJson = opts.json || cmd.parent?.opts().json;
      const mode = isJson ? OutputMode.Json : OutputMode.Human;

      const hasJupiterKey = !!opts.jupiterApiKey;
      const hasRpc = !!opts.rpc;
      const hasWallet = !!opts.wallet || !!opts.generateWallet;

      // Determine interactive vs non-interactive
      const isTty = process.stdin.isTTY === true;
      const isNonInteractive = hasJupiterKey && hasRpc && hasWallet;

      if (!isNonInteractive && !isTty) {
        // Non-TTY with missing required flags
        const missing: string[] = [];
        if (!hasJupiterKey) missing.push('--jupiter-api-key');
        if (!hasRpc) missing.push('--rpc');
        if (!hasWallet) missing.push('--wallet or --generate-wallet');
        const msg = `Missing required flags for non-interactive mode: ${missing.join(', ')}`;
        printError(msg, mode, EXIT_CONFIG);
        process.exit(EXIT_CONFIG);
      }

      // Load existing config for defaults
      const existingConfig = loadConfig();

      let jupiterApiKey: string;
      let rpc: string;
      let walletPath: string;
      let walletGenerated = false;
      let maxSlippageBps: string | undefined = opts.maxSlippageBps;
      let maxTradeSol: string | undefined = opts.maxTradeSol;
      let maxPriceImpactBps: string | undefined = opts.maxPriceImpactBps;

      if (isNonInteractive) {
        // Non-interactive: use flags directly
        jupiterApiKey = opts.jupiterApiKey;
        rpc = opts.rpc;

        if (opts.generateWallet) {
          try {
            const kp = generateWallet(opts.walletOutput);
            walletPath = opts.walletOutput;
            walletGenerated = true;
          } catch (err) {
            printError(err instanceof Error ? err : String(err), mode, EXIT_CONFIG);
            process.exit(EXIT_CONFIG);
          }
        } else {
          walletPath = opts.wallet;
        }
      } else {
        // Interactive mode
        const rl = createInterface({ input: process.stdin, output: process.stdout });

        console.log('\n  ClawDex Onboarding\n');

        // Step 1: Jupiter API key
        console.log('  Step 1/5: Jupiter API Key');
        console.log('  Get a free key at https://portal.jup.ag/api-keys\n');
        const defaultKey = existingConfig.jupiter_api_key || '';
        const keyPrompt = defaultKey ? `  Jupiter API Key [${maskApiKey(defaultKey)}]: ` : '  Jupiter API Key []: ';
        const keyAnswer = await prompt(rl, keyPrompt);
        jupiterApiKey = keyAnswer || defaultKey;

        // Step 2: RPC
        console.log('\n  Step 2/5: Solana RPC Endpoint\n');
        const defaultRpc = existingConfig.rpc || DEFAULT_RPC;
        const rpcAnswer = await prompt(rl, `  RPC URL [${defaultRpc}]: `);
        rpc = rpcAnswer || defaultRpc;

        // Step 3: Wallet
        console.log('\n  Step 3/5: Wallet\n');
        const hasExistingAnswer = await prompt(rl, '  Do you have an existing wallet? (y/n) [y]: ');
        const hasExisting = hasExistingAnswer.toLowerCase() !== 'n';

        if (hasExisting) {
          const defaultWallet = existingConfig.wallet || '~/.config/solana/id.json';
          const walletAnswer = await prompt(rl, `  Wallet path [${defaultWallet}]: `);
          walletPath = walletAnswer || defaultWallet;
        } else {
          const walletOutputPath = opts.walletOutput || '~/.clawdex/wallet.json';
          console.log(`  Generating new wallet at ${walletOutputPath}...`);
          try {
            const kp = generateWallet(walletOutputPath);
            walletPath = walletOutputPath;
            walletGenerated = true;
            const pubkey = kp.publicKey.toBase58();
            console.log(`  Created! Pubkey: ${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`  Error: ${msg}`);
            rl.close();
            process.exit(EXIT_CONFIG);
          }
        }

        // Step 4: Safety guardrails
        console.log('\n  Step 4/5: Safety Guardrails (optional, press Enter to skip)\n');
        const slipAnswer = await prompt(rl, '  Max slippage (bps) []: ');
        if (slipAnswer) maxSlippageBps = slipAnswer;

        const tradeAnswer = await prompt(rl, '  Max trade size (SOL) []: ');
        if (tradeAnswer) maxTradeSol = tradeAnswer;

        const impactAnswer = await prompt(rl, '  Max price impact (bps) []: ');
        if (impactAnswer) maxPriceImpactBps = impactAnswer;

        console.log('\n  Step 5/5: Validating...\n');

        rl.close();
      }

      // Validation
      const validation: OnboardingResult['validation'] = {
        jupiter_api_key: { valid: false, token_count: null },
        rpc: { healthy: false, latency_ms: null },
        wallet: { valid: false, pubkey: null },
        config_written: false,
      };

      let allValid = true;

      // Validate Jupiter API key
      try {
        const tokens = await fetchTokenList(jupiterApiKey);
        validation.jupiter_api_key.valid = true;
        validation.jupiter_api_key.token_count = tokens.length;
        if (!isJson) console.log(`  Jupiter API key... OK (${tokens.length} tokens)`);
      } catch (err) {
        allValid = false;
        validation.jupiter_api_key.error = err instanceof Error ? err.message : String(err);
        if (!isJson) console.log(`  Jupiter API key... FAIL (${validation.jupiter_api_key.error})`);
      }

      // Validate RPC
      try {
        const connection = new Connection(rpc);
        const start = performance.now();
        await connection.getSlot();
        const latency = Math.round(performance.now() - start);
        validation.rpc.healthy = true;
        validation.rpc.latency_ms = latency;
        if (!isJson) console.log(`  RPC endpoint...   OK (${latency}ms)`);
      } catch (err) {
        allValid = false;
        validation.rpc.error = err instanceof Error ? err.message : String(err);
        if (!isJson) console.log(`  RPC endpoint...   FAIL (${validation.rpc.error})`);
      }

      // Validate wallet
      try {
        const keypair = loadWallet(walletPath!);
        const pubkey = keypair.publicKey.toBase58();
        validation.wallet.valid = true;
        validation.wallet.pubkey = pubkey;
        if (!isJson) console.log(`  Wallet...         OK (${pubkey.slice(0, 4)}...${pubkey.slice(-4)})`);
      } catch (err) {
        allValid = false;
        validation.wallet.error = err instanceof Error ? err.message : String(err);
        if (!isJson) console.log(`  Wallet...         FAIL (${validation.wallet.error})`);
      }

      // Write config only if all validations pass
      if (allValid) {
        try {
          setConfigValue('jupiter_api_key', jupiterApiKey);
          setConfigValue('rpc', rpc);
          setConfigValue('wallet', walletPath!);

          // Optional config values
          if (opts.feeBps != null) setConfigValue('fee_bps', String(opts.feeBps));
          if (opts.feeAccount != null) setConfigValue('fee_account', opts.feeAccount);
          if (opts.autoCreateFeeAta != null) setConfigValue('auto_create_fee_ata', String(opts.autoCreateFeeAta));
          if (opts.receiptsDir != null) setConfigValue('receipts_dir', opts.receiptsDir);

          // Safety values
          if (maxSlippageBps != null) setSafetyValue('max_slippage_bps', maxSlippageBps);
          if (maxTradeSol != null) setSafetyValue('max_trade_sol', maxTradeSol);
          if (maxPriceImpactBps != null) setSafetyValue('max_price_impact_bps', maxPriceImpactBps);

          validation.config_written = true;
        } catch (err) {
          allValid = false;
          if (!isJson) console.log(`  Config write...   FAIL (${err instanceof Error ? err.message : String(err)})`);
        }
      }

      // Reload config to get final values with defaults applied
      const finalConfig = loadConfig();

      const result: OnboardingResult = {
        success: allValid,
        config: {
          jupiter_api_key: maskApiKey(jupiterApiKey),
          rpc: rpc,
          wallet: walletPath!,
          wallet_pubkey: validation.wallet.pubkey || '',
          wallet_generated: walletGenerated,
          fee_bps: finalConfig.fee_bps,
          fee_account: finalConfig.fee_account,
          auto_create_fee_ata: finalConfig.auto_create_fee_ata,
          receipts_dir: finalConfig.receipts_dir,
        },
        validation,
      };

      if (isJson) {
        printResult(result, OutputMode.Json);
      } else {
        if (allValid) {
          console.log(`\n  Onboarding complete! Config written to ~/.clawdex/config.toml`);
          console.log('  Run `clawdex status` to verify, or `clawdex swap` to start trading.');
        } else {
          console.log('\n  Onboarding failed — fix the errors above and try again.');
        }
      }

      process.exit(allValid ? EXIT_SUCCESS : EXIT_CONFIG);
    });

  return cmd;
}
