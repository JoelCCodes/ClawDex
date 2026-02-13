#!/usr/bin/env node
import { Command } from 'commander';
import { configCommand } from './commands/config.js';
import { safetyCommand } from './commands/safety.js';
import { statusCommand } from './commands/status.js';
import { balancesCommand } from './commands/balances.js';
import { quoteCommand } from './commands/quote.js';
import { receiptCommand } from './commands/receipt.js';
import { swapCommand } from './commands/swap.js';
import { sendCommand } from './commands/send.js';
import { setupFeesCommand } from './commands/setup-fees.js';
import { onboardingCommand } from './commands/onboarding.js';
import { walletCommand } from './commands/wallet.js';

const program = new Command();

program
  .name('clawdex')
  .description('Solana DEX trading CLI powered by Jupiter')
  .version('0.3.1')
  .showHelpAfterError()
  .enablePositionalOptions()
  .passThroughOptions()
  .option('--json', 'Output in JSON format')
  .option('--wallet <path>', 'Path to wallet keypair JSON');

program.addCommand(configCommand());
program.addCommand(safetyCommand());
program.addCommand(statusCommand());
program.addCommand(balancesCommand());
program.addCommand(quoteCommand());
program.addCommand(receiptCommand());
program.addCommand(swapCommand());
program.addCommand(sendCommand());
program.addCommand(setupFeesCommand());
program.addCommand(onboardingCommand());
program.addCommand(walletCommand());

program.parse();
