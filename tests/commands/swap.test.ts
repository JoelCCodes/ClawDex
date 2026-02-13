import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtemp, rm, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { readFileSync } from 'fs';
import { Keypair } from '@solana/web3.js';

const CLI = join(import.meta.dir, '../../src/cli.ts');
const PROJECT_ROOT = join(import.meta.dir, '../..');

let tempDir: string;
let env: Record<string, string>;
let keypairPath: string;
let keypair: Keypair;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'clawdex-cmd-swap-'));
  keypair = Keypair.generate();
  keypairPath = join(tempDir, 'wallet.json');
  await Bun.write(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));

  env = {
    ...process.env as Record<string, string>,
    HOME: tempDir,
  };
  delete env.CLAWDEX_RPC;
  delete env.CLAWDEX_WALLET;
  delete env.CLAWDEX_FEE_BPS;
  delete env.CLAWDEX_FEE_ACCOUNT;
  delete env.CLAWDEX_RECEIPTS_DIR;
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function run(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', 'run', CLI, ...args], {
    cwd: PROJECT_ROOT,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

/**
 * Create a test driver script that mocks core modules and runs the swap command.
 * Uses absolute paths so the driver can find project modules from the temp dir.
 */
async function createMockDriver(overrides: {
  safetyResult?: { safe: boolean; violations: string[] };
  simulateResult?: 'error' | 'ok';
  simulateError?: string;
  transferValidation?: { safe: boolean; unknownAddresses: string[] };
  sendResult?: 'error' | 'ok';
  sendError?: string;
  confirmResult?: { value: { err: unknown } } | 'error';
  confirmError?: string;
}): Promise<string> {
  const driverPath = join(tempDir, 'swap-driver.ts');
  const srcRoot = join(PROJECT_ROOT, 'src');

  const driverContent = `
import { mock } from 'bun:test';
import { readFileSync } from 'fs';
import { Keypair, MessageV0, VersionedTransaction } from '@solana/web3.js';

const safetyResult = ${JSON.stringify(overrides.safetyResult ?? { safe: true, violations: [] })};
const simulateIsError = ${overrides.simulateResult === 'error'};
const simulateError = ${JSON.stringify(overrides.simulateError ?? 'Simulation failed')};
const transferValidation = ${JSON.stringify(overrides.transferValidation ?? { safe: true, unknownAddresses: [] })};
const sendIsError = ${overrides.sendResult === 'error'};
const sendError = ${JSON.stringify(overrides.sendError ?? 'Send failed')};
const confirmIsError = ${overrides.confirmResult === 'error'};
const confirmError = ${JSON.stringify(overrides.confirmError ?? 'Confirm failed')};
const confirmResultValue = ${JSON.stringify(
    overrides.confirmResult && overrides.confirmResult !== 'error'
      ? overrides.confirmResult
      : { value: { err: null } }
  )};

const storedReceipts: unknown[] = [];

// Load the test wallet keypair so we can create a tx that it can sign
const walletBytes = JSON.parse(readFileSync(process.env.MOCK_WALLET_PATH!, 'utf-8'));
const walletKeypair = Keypair.fromSecretKey(Uint8Array.from(walletBytes));

// Build a mock transaction using the wallet's public key as signer
const mockMessage = new MessageV0({
  header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 },
  staticAccountKeys: [walletKeypair.publicKey],
  recentBlockhash: '11111111111111111111111111111111',
  compiledInstructions: [],
  addressTableLookups: [],
});
const mockTx = new VersionedTransaction(mockMessage);
const mockTxBase64 = Buffer.from(mockTx.serialize()).toString('base64');

// Mock the connection module to return a mock Connection object
// (mocking @solana/web3.js directly doesn't work for static imports in transitive deps)
mock.module('${srcRoot}/core/connection.js', () => ({
  createConnection: () => ({
    sendRawTransaction: async (..._args: unknown[]) => {
      if (sendIsError) throw new Error(sendError);
      return 'mock-signature-abc123';
    },
    confirmTransaction: async (..._args: unknown[]) => {
      if (confirmIsError) throw new Error(confirmError);
      return confirmResultValue;
    },
  }),
}));

mock.module('${srcRoot}/core/config.js', () => ({
  resolveConfig: () => ({
    rpc: 'https://mock-rpc.test',
    wallet: process.env.MOCK_WALLET_PATH || '',
    fee_bps: 0,
    fee_account: '',
    receipts_dir: process.env.HOME + '/.clawdex/receipts',
    safety: {},
  }),
  expandHome: (p: string) => p.startsWith('~') ? p.replace('~', process.env.HOME!) : p,
}));

mock.module('${srcRoot}/core/tokens.js', () => ({
  resolveToken: async (sym: string) => {
    if (sym.toUpperCase() === 'SOL') return { symbol: 'SOL', name: 'Solana', mint: 'So11111111111111111111111111111111', decimals: 9 };
    if (sym.toUpperCase() === 'USDC') return { symbol: 'USDC', name: 'USD Coin', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 };
    throw new Error('Token not found: ' + sym);
  },
}));

mock.module('${srcRoot}/core/jupiter.js', () => ({
  getQuote: async () => ({
    inputMint: 'So11111111111111111111111111111111',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    inAmount: '1000000000',
    outAmount: '23456789',
    otherAmountThreshold: '23222221',
    swapMode: 'ExactIn',
    slippageBps: 50,
    platformFee: { amount: '11728', feeBps: 50 },
    priceImpactPct: '0.12',
    routePlan: [{
      swapInfo: {
        ammKey: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        label: 'Raydium',
        inputMint: 'So11111111111111111111111111111111',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        inAmount: '1000000000',
        outAmount: '23456789',
        feeAmount: '5000',
        feeMint: 'So11111111111111111111111111111111',
      },
      percent: 100,
    }],
    contextSlot: 250000000,
  }),
  getSwapTransaction: async () => ({ swapTransaction: mockTxBase64, lastValidBlockHeight: 300000000 }),
  amountToSmallestUnit: (amount: number, decimals: number) => Math.round(amount * (10 ** decimals)).toString(),
  deriveFeeAta: (feeWallet: string, mint: string) => feeWallet + '-' + mint.slice(0, 8),
}));

mock.module('${srcRoot}/core/safety.js', () => ({
  validateSafety: () => safetyResult,
}));

mock.module('${srcRoot}/core/receipts.js', () => ({
  storeReceipt: async (receipt: unknown) => { storedReceipts.push(receipt); },
  lookupReceipt: async () => null,
}));

mock.module('${srcRoot}/core/simulate.js', () => ({
  simulateAndDiff: async () => {
    if (simulateIsError) throw new Error(simulateError);
    return { solChange: -5000, tokenChanges: [], destinations: ['58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2'], feeAmount: 5000 };
  },
  buildKnownAddresses: () => {
    const s = new Set<string>();
    s.add('58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2');
    return s;
  },
  validateTransfers: () => transferValidation,
  formatTransferDiff: () => '  SOL: -0.000005000 SOL\\n  Network fee: 0.000005000 SOL',
}));

// Import and run the swap command AFTER all mocks are set up
const { Command } = await import('commander');
const { swapCommand } = await import('${srcRoot}/commands/swap.js');

const program = new Command();
program
  .name('clawdex')
  .enablePositionalOptions()
  .passThroughOptions()
  .option('--json', 'Output in JSON format')
  .option('--wallet <path>', 'Path to wallet keypair JSON');
program.addCommand(swapCommand());

// Intercept process.exit to save receipts
const originalExit = process.exit;
process.exit = ((code?: number) => {
  if (storedReceipts.length > 0) {
    const { writeFileSync, mkdirSync, existsSync } = require('fs');
    const dir = process.env.HOME + '/.clawdex';
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(dir + '/test-receipts.json', JSON.stringify(storedReceipts));
  }
  originalExit(code);
}) as never;

program.parse(process.argv);
`;

  await Bun.write(driverPath, driverContent);
  return driverPath;
}

async function runDriver(
  driverPath: string,
  args: string[],
  extraEnv?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', 'run', driverPath, ...args], {
    cwd: PROJECT_ROOT,
    env: { ...env, ...extraEnv },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

function readTestReceipts(): unknown[] {
  try {
    const content = readFileSync(join(tempDir, '.clawdex', 'test-receipts.json'), 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

// ---- Flag parsing and config error tests (use real CLI subprocess) ----

describe('swap command - flag parsing and config errors', () => {
  it('errors when --in is missing', async () => {
    const { exitCode, stderr } = await run(['swap', '--out', 'USDC', '--amount', '1', '--yes', '--wallet', keypairPath]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("required option '--in <token>'");
  });

  it('errors when --out is missing', async () => {
    const { exitCode, stderr } = await run(['swap', '--in', 'SOL', '--amount', '1', '--yes', '--wallet', keypairPath]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("required option '--out <token>'");
  });

  it('errors when --amount is missing', async () => {
    const { exitCode, stderr } = await run(['swap', '--in', 'SOL', '--out', 'USDC', '--yes', '--wallet', keypairPath]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("required option '--amount <number>'");
  });

  it('errors when no wallet configured (exit 5)', async () => {
    const { exitCode, stderr } = await run(['swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1', '--yes', '--json']);
    expect(exitCode).toBe(5);
    expect(stderr).toContain('No wallet configured');
  });

  it('errors when wallet file not found (exit 5)', async () => {
    const { exitCode, stderr } = await run([
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1',
      '--yes', '--json', '--wallet', '/nonexistent/wallet.json',
    ]);
    expect(exitCode).toBe(5);
    expect(stderr).toContain('Wallet file not found');
  });

  it('non-TTY without --yes rejects (agent safety)', async () => {
    const { exitCode, stderr } = await run([
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1',
      '--json', '--wallet', keypairPath,
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Non-interactive mode requires --yes flag');
  });

  it('invalid amount rejects (exit 1)', async () => {
    const { exitCode, stderr } = await run([
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', 'abc',
      '--yes', '--json', '--wallet', keypairPath,
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('positive number');
  });
});

// ---- Pipeline tests with mocked core modules ----

describe('swap command - pipeline with mocked modules', () => {
  it('safety check failure exits with code 2 and stores receipt', async () => {
    const driver = await createMockDriver({
      safetyResult: { safe: false, violations: ['Slippage 500 bps exceeds maximum 100 bps'] },
    });

    const { exitCode, stdout } = await runDriver(driver, [
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1', '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(2);
    const output = JSON.parse(stdout.trim());
    expect(output.success).toBe(false);
    expect(output.error).toBe('SAFETY_CHECK_FAILED');
    expect(output.violations).toContain('Slippage 500 bps exceeds maximum 100 bps');

    const receipts = readTestReceipts();
    expect(receipts.length).toBe(1);
    expect((receipts[0] as any).status).toBe('failed');
    expect((receipts[0] as any).error).toContain('Safety check failed');
  });

  it('simulation failure exits with code 3 and stores receipt', async () => {
    const driver = await createMockDriver({
      simulateResult: 'error',
      simulateError: 'Transaction simulation failed: InsufficientFundsForRent',
    });

    const { exitCode, stdout } = await runDriver(driver, [
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1', '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(3);
    const output = JSON.parse(stdout.trim());
    expect(output.success).toBe(false);
    expect(output.error).toBe('SIMULATION_FAILED');
    expect(output.message).toContain('InsufficientFundsForRent');

    const receipts = readTestReceipts();
    expect(receipts.length).toBe(1);
    expect((receipts[0] as any).status).toBe('failed');
  });

  it('unknown transfer addresses exit with code 2', async () => {
    const driver = await createMockDriver({
      transferValidation: { safe: false, unknownAddresses: ['EvilAddress111111111111111111111111'] },
    });

    const { exitCode, stdout } = await runDriver(driver, [
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1', '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(2);
    const output = JSON.parse(stdout.trim());
    expect(output.success).toBe(false);
    expect(output.error).toBe('UNKNOWN_TRANSFER');
    expect(output.unknownAddresses).toContain('EvilAddress111111111111111111111111');
  });

  it('--simulate-only stops after simulation and exits 0', async () => {
    const driver = await createMockDriver({});

    const { exitCode, stdout } = await runDriver(driver, [
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1',
      '--yes', '--json', '--simulate-only', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout.trim());
    expect(output.success).toBe(true);
    expect(output.simulated).toBe(true);
    expect(output.signature).toBeNull();
    expect(output.input.symbol).toBe('SOL');
    expect(output.output.symbol).toBe('USDC');

    const receipts = readTestReceipts();
    expect(receipts.length).toBe(1);
    expect((receipts[0] as any).status).toBe('simulated');
  });

  it('--skip-simulation skips simulation step', async () => {
    const driver = await createMockDriver({});

    const { exitCode, stderr } = await runDriver(driver, [
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1',
      '--yes', '--skip-simulation', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(0);
    expect(stderr).toContain('WARNING');
    expect(stderr).toContain('Skipping simulation');
  });

  it('send failure exits with code 4 and stores receipt', async () => {
    const driver = await createMockDriver({
      sendResult: 'error',
      sendError: 'Network timeout: failed to send transaction',
    });

    const { exitCode, stdout } = await runDriver(driver, [
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1',
      '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(4);
    const output = JSON.parse(stdout.trim());
    expect(output.success).toBe(false);
    expect(output.error).toBe('SEND_FAILED');
    expect(output.message).toContain('Network timeout');

    const receipts = readTestReceipts();
    expect(receipts.length).toBe(1);
    expect((receipts[0] as any).status).toBe('failed');
  });

  it('confirm failure (on-chain error) exits with code 4', async () => {
    const driver = await createMockDriver({
      confirmResult: { value: { err: 'InstructionError' } },
    });

    const { exitCode, stdout } = await runDriver(driver, [
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1',
      '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(4);
    const output = JSON.parse(stdout.trim());
    expect(output.success).toBe(false);
    expect(output.error).toBe('TRANSACTION_FAILED');
  });

  it('successful swap exits with code 0 and stores receipt', async () => {
    const driver = await createMockDriver({});

    const { exitCode, stdout } = await runDriver(driver, [
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1',
      '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout.trim());
    expect(output.success).toBe(true);
    expect(output.signature).toBe('mock-signature-abc123');
    expect(output.input.symbol).toBe('SOL');
    expect(output.output.symbol).toBe('USDC');

    const receipts = readTestReceipts();
    expect(receipts.length).toBe(1);
    expect((receipts[0] as any).status).toBe('success');
    expect((receipts[0] as any).txSignature).toBe('mock-signature-abc123');
  });

  it('--yes --json mode works without prompts (agent mode)', async () => {
    const driver = await createMockDriver({});

    const { exitCode, stdout } = await runDriver(driver, [
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1',
      '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout.trim());
    expect(output.success).toBe(true);
  });

  it('safety checks still apply in agent mode (--yes --json)', async () => {
    const driver = await createMockDriver({
      safetyResult: { safe: false, violations: ['Fee 200 bps exceeds maximum 100 bps'] },
    });

    const { exitCode, stdout } = await runDriver(driver, [
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1',
      '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(2);
    const output = JSON.parse(stdout.trim());
    expect(output.error).toBe('SAFETY_CHECK_FAILED');
  });

  it('successful swap human mode shows signature', async () => {
    const driver = await createMockDriver({});

    const { exitCode, stdout } = await runDriver(driver, [
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1',
      '--yes', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Swap successful');
    expect(stdout).toContain('mock-signature-abc123');
  });

  it('--simulate-only human mode shows simulation result', async () => {
    const driver = await createMockDriver({});

    const { exitCode, stdout } = await runDriver(driver, [
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1',
      '--yes', '--simulate-only', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Simulation Result');
    expect(stdout).toContain('SOL');
    expect(stdout).toContain('USDC');
  });

  it('receipt includes route info on success', async () => {
    const driver = await createMockDriver({});

    await runDriver(driver, [
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1',
      '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    const receipts = readTestReceipts();
    expect(receipts.length).toBe(1);
    const receipt = receipts[0] as any;
    expect(receipt.route).toContain('Raydium');
    expect(receipt.inputToken.symbol).toBe('SOL');
    expect(receipt.outputToken.symbol).toBe('USDC');
    expect(receipt.inputAmount).toBe('1');
  });

  it('receipt stored on safety failure includes error details', async () => {
    const driver = await createMockDriver({
      safetyResult: { safe: false, violations: ['Trade too large', 'Token not in allowlist'] },
    });

    await runDriver(driver, [
      'swap', '--in', 'SOL', '--out', 'USDC', '--amount', '1',
      '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    const receipts = readTestReceipts();
    expect(receipts.length).toBe(1);
    const receipt = receipts[0] as any;
    expect(receipt.status).toBe('failed');
    expect(receipt.error).toContain('Trade too large');
    expect(receipt.error).toContain('Token not in allowlist');
  });
});
