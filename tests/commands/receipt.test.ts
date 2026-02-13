import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtemp, rm, mkdir } from 'fs/promises';
import { tmpdir } from 'os';

const CLI = join(import.meta.dir, '../../src/cli.ts');

let tempDir: string;
let env: Record<string, string>;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'clawdex-cmd-receipt-'));
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
    cwd: join(import.meta.dir, '../..'),
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

const mockReceipt = {
  timestamp: '2025-01-15T10:30:00.000Z',
  txSignature: '5Kj7abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
  inputToken: { symbol: 'SOL', name: 'Solana', mint: 'So11111111111111111111111111111111', decimals: 9 },
  outputToken: { symbol: 'USDC', name: 'USD Coin', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  inputAmount: '1.0',
  outputAmount: '23.456789',
  route: 'Raydium (100%)',
  fees: { platformFeeBps: 50, platformFeeAmount: '0.011728', networkFee: 5000 },
  status: 'success' as const,
};

describe('receipt', () => {
  it('returns error when receipt not found', async () => {
    const { exitCode, stderr } = await run(['receipt', 'nonexistent_signature']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Receipt not found');
  });

  it('returns error in JSON mode when receipt not found', async () => {
    const { exitCode, stderr } = await run(['receipt', 'nonexistent_signature', '--json']);
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stderr.trim());
    expect(parsed.error).toContain('Receipt not found');
  });

  it('finds and displays a stored receipt', async () => {
    // Write a receipt to the receipts file
    const receiptsDir = join(tempDir, '.clawdex', 'receipts');
    await mkdir(receiptsDir, { recursive: true });
    await Bun.write(join(receiptsDir, 'receipts.jsonl'), JSON.stringify(mockReceipt) + '\n');

    const { exitCode, stdout } = await run(['receipt', mockReceipt.txSignature]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Receipt');
    expect(stdout).toContain(mockReceipt.txSignature);
    expect(stdout).toContain('SOL');
    expect(stdout).toContain('USDC');
    expect(stdout).toContain('success');
  });

  it('returns JSON receipt with --json flag', async () => {
    const receiptsDir = join(tempDir, '.clawdex', 'receipts');
    await mkdir(receiptsDir, { recursive: true });
    await Bun.write(join(receiptsDir, 'receipts.jsonl'), JSON.stringify(mockReceipt) + '\n');

    const { exitCode, stdout } = await run(['receipt', mockReceipt.txSignature, '--json']);
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.txSignature).toBe(mockReceipt.txSignature);
    expect(parsed.inputToken.symbol).toBe('SOL');
    expect(parsed.outputToken.symbol).toBe('USDC');
    expect(parsed.inputAmount).toBe('1.0');
    expect(parsed.outputAmount).toBe('23.456789');
    expect(parsed.status).toBe('success');
    expect(parsed.fees.platformFeeBps).toBe(50);
  });

  it('finds correct receipt among multiple entries', async () => {
    const receipt2 = {
      ...mockReceipt,
      txSignature: 'AAAA1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd',
      inputAmount: '5.0',
      outputAmount: '117.0',
    };

    const receiptsDir = join(tempDir, '.clawdex', 'receipts');
    await mkdir(receiptsDir, { recursive: true });
    const content = JSON.stringify(mockReceipt) + '\n' + JSON.stringify(receipt2) + '\n';
    await Bun.write(join(receiptsDir, 'receipts.jsonl'), content);

    const { exitCode, stdout } = await run(['receipt', receipt2.txSignature, '--json']);
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.txSignature).toBe(receipt2.txSignature);
    expect(parsed.inputAmount).toBe('5.0');
  });
});
