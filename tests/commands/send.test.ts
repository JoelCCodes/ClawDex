import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { readFileSync } from 'fs';
import { Keypair } from '@solana/web3.js';

const CLI = join(import.meta.dir, '../../src/cli.ts');
const PROJECT_ROOT = join(import.meta.dir, '../..');

let tempDir: string;
let env: Record<string, string>;
let keypairPath: string;
let keypair: Keypair;
let recipientAddress: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'clawdex-cmd-send-'));
  keypair = Keypair.generate();
  keypairPath = join(tempDir, 'wallet.json');
  await Bun.write(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));
  // Generate a real on-curve address for the recipient
  recipientAddress = Keypair.generate().publicKey.toBase58();

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
 * Create a test driver script that mocks core modules and runs the send command.
 */
async function createMockDriver(overrides: {
  isSol?: boolean;
  simulateResult?: 'error' | 'ok';
  simulateError?: string;
  sendResult?: 'error' | 'ok';
  sendError?: string;
  confirmResult?: { value: { err: unknown } } | 'error';
  confirmError?: string;
  recipientAtaExists?: boolean;
  safetyMaxTradeSol?: number;
}): Promise<string> {
  const driverPath = join(tempDir, 'send-driver.ts');
  const srcRoot = join(PROJECT_ROOT, 'src');

  const driverContent = `
import { mock } from 'bun:test';
import { readFileSync } from 'fs';
import { Keypair } from '@solana/web3.js';

const simulateIsError = ${overrides.simulateResult === 'error'};
const simulateError = ${JSON.stringify(overrides.simulateError ?? 'Simulation failed')};
const sendIsError = ${overrides.sendResult === 'error'};
const sendError = ${JSON.stringify(overrides.sendError ?? 'Send failed')};
const confirmIsError = ${overrides.confirmResult === 'error'};
const confirmError = ${JSON.stringify(overrides.confirmError ?? 'Confirm failed')};
const confirmResultValue = ${JSON.stringify(
    overrides.confirmResult && overrides.confirmResult !== 'error'
      ? overrides.confirmResult
      : { value: { err: null } }
  )};
const recipientAtaExists = ${overrides.recipientAtaExists !== false};
const safetyMaxTradeSol = ${overrides.safetyMaxTradeSol != null ? overrides.safetyMaxTradeSol : 'undefined'};

const storedReceipts: unknown[] = [];

// Build a minimal token account data buffer for getAccount mock (165 bytes)
function buildTokenAccountData(mint: Uint8Array, owner: Uint8Array): Buffer {
  const data = Buffer.alloc(165);
  data.set(mint, 0);        // mint: bytes 0-31
  data.set(owner, 32);      // owner: bytes 32-63
  // amount: bytes 64-71 (u64 LE, already 0)
  // delegateOption: bytes 72-75 (u32 LE = 0 = None)
  // delegate: bytes 76-107
  data[108] = 1;             // state: byte 108 = 1 (Initialized)
  // isNativeOption, isNative, delegatedAmount, closeAuthorityOption, closeAuthority: all 0
  return data;
}

mock.module('${srcRoot}/core/connection.js', () => ({
  createConnection: () => ({
    sendRawTransaction: async (..._args: unknown[]) => {
      if (sendIsError) throw new Error(sendError);
      return 'mock-send-signature-abc123';
    },
    confirmTransaction: async (..._args: unknown[]) => {
      if (confirmIsError) throw new Error(confirmError);
      return confirmResultValue;
    },
    getLatestBlockhash: async () => ({ blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 300000000 }),
    getAccountInfo: async (address: any) => {
      if (!recipientAtaExists) return null;
      // Return a minimal valid token account info for getAccount to parse
      const { PublicKey } = await import('@solana/web3.js');
      const tokenProgramId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      return {
        data: buildTokenAccountData(usdcMint.toBytes(), address.toBytes()),
        owner: tokenProgramId,
        lamports: 2039280,
        executable: false,
        rentEpoch: 0,
      };
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
    safety: safetyMaxTradeSol != null ? { max_trade_sol: safetyMaxTradeSol } : {},
  }),
  expandHome: (p: string) => p.startsWith('~') ? p.replace('~', process.env.HOME!) : p,
}));

mock.module('${srcRoot}/core/tokens.js', () => ({
  resolveToken: async (sym: string) => {
    if (sym.toUpperCase() === 'SOL') return { symbol: 'SOL', name: 'Solana', mint: 'So11111111111111111111111111111111111111112', decimals: 9 };
    if (sym.toUpperCase() === 'USDC') return { symbol: 'USDC', name: 'USD Coin', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 };
    throw new Error('Token not found: ' + sym);
  },
  isValidBase58: (str: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str),
}));

mock.module('${srcRoot}/core/jupiter.js', () => ({
  amountToSmallestUnit: (amount: number, decimals: number) => Math.round(amount * (10 ** decimals)).toString(),
}));

mock.module('${srcRoot}/core/receipts.js', () => ({
  storeReceipt: async (receipt: unknown) => { storedReceipts.push(receipt); },
  lookupReceipt: async () => null,
}));

mock.module('${srcRoot}/core/simulate.js', () => ({
  simulateAndDiff: async () => {
    if (simulateIsError) throw new Error(simulateError);
    return { solChange: -5000, tokenChanges: [], destinations: [], feeAmount: 5000 };
  },
  formatTransferDiff: () => '  SOL: -0.000005000 SOL\\n  Network fee: 0.000005000 SOL',
}));

// Import and run the send command AFTER all mocks are set up
const { Command } = await import('commander');
const { sendCommand } = await import('${srcRoot}/commands/send.js');

const program = new Command();
program
  .name('clawdex')
  .enablePositionalOptions()
  .passThroughOptions()
  .option('--json', 'Output in JSON format')
  .option('--wallet <path>', 'Path to wallet keypair JSON');
program.addCommand(sendCommand());

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

// ---- Flag parsing and config error tests ----

describe('send command - flag parsing and config errors', () => {
  it('errors when --to is missing', async () => {
    const { exitCode, stderr } = await run(['send', '--token', 'SOL', '--amount', '1', '--yes', '--wallet', keypairPath]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("required option '--to <address>'");
  });

  it('errors when --token is missing', async () => {
    const { exitCode, stderr } = await run(['send', '--to', recipientAddress, '--amount', '1', '--yes', '--wallet', keypairPath]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("required option '--token <symbol|mint>'");
  });

  it('errors when --amount is missing', async () => {
    const { exitCode, stderr } = await run(['send', '--to', recipientAddress, '--token', 'SOL', '--yes', '--wallet', keypairPath]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("required option '--amount <number>'");
  });

  it('errors when no wallet configured (exit 5)', async () => {
    const { exitCode, stderr } = await run([
      'send', '--to', recipientAddress, '--token', 'SOL', '--amount', '1', '--yes', '--json',
    ]);
    expect(exitCode).toBe(5);
    expect(stderr).toContain('No wallet configured');
  });

  it('errors when wallet file not found (exit 5)', async () => {
    const { exitCode, stderr } = await run([
      'send', '--to', recipientAddress, '--token', 'SOL', '--amount', '1',
      '--yes', '--json', '--wallet', '/nonexistent/wallet.json',
    ]);
    expect(exitCode).toBe(5);
    expect(stderr).toContain('Wallet file not found');
  });

  it('non-TTY without --yes rejects (agent safety)', async () => {
    const { exitCode, stderr } = await run([
      'send', '--to', recipientAddress, '--token', 'SOL', '--amount', '1',
      '--json', '--wallet', keypairPath,
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Non-interactive mode requires --yes flag');
  });

  it('invalid amount rejects (exit 1)', async () => {
    const { exitCode, stderr } = await run([
      'send', '--to', recipientAddress, '--token', 'SOL', '--amount', 'abc',
      '--yes', '--json', '--wallet', keypairPath,
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('positive number');
  });

  it('invalid recipient address rejects (exit 1)', async () => {
    const { exitCode, stderr } = await run([
      'send', '--to', 'not-a-valid-address', '--token', 'SOL', '--amount', '1',
      '--yes', '--json', '--wallet', keypairPath,
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('valid Solana address');
  });
});

// ---- Pipeline tests with mocked core modules ----

describe('send command - pipeline with mocked modules', () => {
  it('successful SOL send exits with code 0 and stores receipt', async () => {
    const driver = await createMockDriver({});

    const { exitCode, stdout } = await runDriver(driver, [
      'send', '--to', recipientAddress, '--token', 'SOL', '--amount', '0.01',
      '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout.trim());
    expect(output.success).toBe(true);
    expect(output.signature).toBe('mock-send-signature-abc123');
    expect(output.to).toBe(recipientAddress);
    expect(output.token.symbol).toBe('SOL');
    expect(output.token.amount).toBe('0.01');

    const receipts = readTestReceipts();
    expect(receipts.length).toBe(1);
    expect((receipts[0] as any).status).toBe('success');
    expect((receipts[0] as any).txSignature).toBe('mock-send-signature-abc123');
  });

  it('successful SPL token send exits with code 0', async () => {
    const driver = await createMockDriver({ isSol: false });

    const { exitCode, stdout } = await runDriver(driver, [
      'send', '--to', recipientAddress, '--token', 'USDC', '--amount', '5',
      '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout.trim());
    expect(output.success).toBe(true);
    expect(output.token.symbol).toBe('USDC');
  });

  it('--simulate-only stops after simulation and exits 0', async () => {
    const driver = await createMockDriver({});

    const { exitCode, stdout } = await runDriver(driver, [
      'send', '--to', recipientAddress, '--token', 'SOL', '--amount', '0.01',
      '--yes', '--json', '--simulate-only', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout.trim());
    expect(output.success).toBe(true);
    expect(output.simulated).toBe(true);
    expect(output.signature).toBeNull();
    expect(output.token.symbol).toBe('SOL');

    const receipts = readTestReceipts();
    expect(receipts.length).toBe(1);
    expect((receipts[0] as any).status).toBe('simulated');
  });

  it('simulation failure exits with code 3 and stores receipt', async () => {
    const driver = await createMockDriver({
      simulateResult: 'error',
      simulateError: 'Transaction simulation failed: InsufficientFundsForRent',
    });

    const { exitCode, stdout } = await runDriver(driver, [
      'send', '--to', recipientAddress, '--token', 'SOL', '--amount', '0.01',
      '--yes', '--json', '--wallet', keypairPath,
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

  it('send failure exits with code 4 and stores receipt', async () => {
    const driver = await createMockDriver({
      sendResult: 'error',
      sendError: 'Network timeout: failed to send transaction',
    });

    const { exitCode, stdout } = await runDriver(driver, [
      'send', '--to', recipientAddress, '--token', 'SOL', '--amount', '0.01',
      '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(4);
    const output = JSON.parse(stdout.trim());
    expect(output.success).toBe(false);
    expect(output.error).toBe('SEND_FAILED');
    expect(output.message).toContain('Network timeout');
  });

  it('confirm failure (on-chain error) exits with code 4', async () => {
    const driver = await createMockDriver({
      confirmResult: { value: { err: 'InstructionError' } },
    });

    const { exitCode, stdout } = await runDriver(driver, [
      'send', '--to', recipientAddress, '--token', 'SOL', '--amount', '0.01',
      '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(4);
    const output = JSON.parse(stdout.trim());
    expect(output.success).toBe(false);
    expect(output.error).toBe('TRANSACTION_FAILED');
  });

  it('safety check rejects SOL send exceeding max_trade_sol', async () => {
    const driver = await createMockDriver({
      safetyMaxTradeSol: 0.5,
    });

    const { exitCode, stdout } = await runDriver(driver, [
      'send', '--to', recipientAddress, '--token', 'SOL', '--amount', '1',
      '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(2);
    const output = JSON.parse(stdout.trim());
    expect(output.success).toBe(false);
    expect(output.error).toBe('SAFETY_CHECK_FAILED');
    expect(output.violations[0]).toContain('max_trade_sol');

    const receipts = readTestReceipts();
    expect(receipts.length).toBe(1);
    expect((receipts[0] as any).status).toBe('failed');
  });

  it('safety check allows SOL send within max_trade_sol', async () => {
    const driver = await createMockDriver({
      safetyMaxTradeSol: 1,
    });

    const { exitCode, stdout } = await runDriver(driver, [
      'send', '--to', recipientAddress, '--token', 'SOL', '--amount', '0.5',
      '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout.trim());
    expect(output.success).toBe(true);
  });

  it('successful send human mode shows signature', async () => {
    const driver = await createMockDriver({});

    const { exitCode, stdout } = await runDriver(driver, [
      'send', '--to', recipientAddress, '--token', 'SOL', '--amount', '0.01',
      '--yes', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Send successful');
    expect(stdout).toContain('mock-send-signature-abc123');
  });

  it('--simulate-only human mode shows simulation result', async () => {
    const driver = await createMockDriver({});

    const { exitCode, stdout } = await runDriver(driver, [
      'send', '--to', recipientAddress, '--token', 'SOL', '--amount', '0.01',
      '--yes', '--simulate-only', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Simulation Result');
    expect(stdout).toContain('SOL');
    expect(stdout).toContain(recipientAddress);
  });

  it('receipt stores recipient as route', async () => {
    const driver = await createMockDriver({});

    await runDriver(driver, [
      'send', '--to', recipientAddress, '--token', 'SOL', '--amount', '0.01',
      '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    const receipts = readTestReceipts();
    expect(receipts.length).toBe(1);
    const receipt = receipts[0] as any;
    expect(receipt.route).toBe(recipientAddress);
    expect(receipt.inputToken.symbol).toBe('SOL');
    expect(receipt.outputToken.symbol).toBe('SOL');
    expect(receipt.inputAmount).toBe('0.01');
  });

  it('SPL send creates recipient ATA when missing', async () => {
    const driver = await createMockDriver({
      recipientAtaExists: false,
    });

    const { exitCode, stdout } = await runDriver(driver, [
      'send', '--to', recipientAddress, '--token', 'USDC', '--amount', '5',
      '--yes', '--json', '--wallet', keypairPath,
    ], { MOCK_WALLET_PATH: keypairPath });

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout.trim());
    expect(output.success).toBe(true);
    expect(output.token.symbol).toBe('USDC');
  });
});
