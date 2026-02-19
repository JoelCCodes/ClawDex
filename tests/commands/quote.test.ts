import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';

const CLI = join(import.meta.dir, '../../src/cli.ts');

let tempDir: string;
let env: Record<string, string>;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'agentdex-cmd-quote-'));
  env = {
    ...process.env as Record<string, string>,
    HOME: tempDir,
  };
  delete env.AGENTDEX_RPC;
  delete env.AGENTDEX_WALLET;
  delete env.AGENTDEX_FEE_BPS;
  delete env.AGENTDEX_FEE_ACCOUNT;
  delete env.AGENTDEX_RECEIPTS_DIR;
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

describe('quote', () => {
  it('errors when --in is missing', async () => {
    const { exitCode, stderr } = await run(['quote', '--out', 'USDC', '--amount', '1']);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("required option '--in <token>'");
  });

  it('errors when --out is missing', async () => {
    const { exitCode, stderr } = await run(['quote', '--in', 'SOL', '--amount', '1']);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("required option '--out <token>'");
  });

  it('errors when --amount is missing', async () => {
    const { exitCode, stderr } = await run(['quote', '--in', 'SOL', '--out', 'USDC']);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("required option '--amount <number>'");
  });

  it('errors on invalid amount (non-positive)', async () => {
    const { exitCode, stderr } = await run(['quote', '--in', 'SOL', '--out', 'USDC', '--amount', '-5']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('positive number');
  });

  it('errors on invalid amount (not a number)', async () => {
    const { exitCode, stderr } = await run(['quote', '--in', 'SOL', '--out', 'USDC', '--amount', 'abc']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('positive number');
  });

  it('rejects negative slippage-bps', async () => {
    const { exitCode, stderr } = await run(['quote', '--in', 'SOL', '--out', 'USDC', '--amount', '1', '--slippage-bps', '-10']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--slippage-bps must be between 0 and 10000');
  });

  it('rejects excessive slippage-bps', async () => {
    const { exitCode, stderr } = await run(['quote', '--in', 'SOL', '--out', 'USDC', '--amount', '1', '--slippage-bps', '20000']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--slippage-bps must be between 0 and 10000');
  });

  it('errors on unresolvable token', async () => {
    const { exitCode, stderr } = await run(['quote', '--in', 'FAKETOKENZZ', '--out', 'USDC', '--amount', '1']);
    expect(exitCode).toBe(1);
    // May fail with "Token not found" or a fetch error (no API key in test env)
    expect(stderr.includes('Token not found') || stderr.includes('fetch token list') || stderr.includes('Failed to fetch')).toBe(true);
  });

  it('accepts all valid flags without syntax errors', async () => {
    // This will fail at the Jupiter API level, but proves flag parsing works
    const { stderr } = await run([
      'quote',
      '--in', 'SOL',
      '--out', 'USDC',
      '--amount', '1',
      '--slippage-bps', '100',
      '--fee-bps', '25',
    ]);
    // Should get past flag parsing - error should be from Jupiter API, not commander
    expect(stderr).not.toContain('required option');
    expect(stderr).not.toContain('unknown option');
  });

  it('accepts --json flag', async () => {
    // Will fail at API, but proves --json is accepted
    const { stderr } = await run([
      'quote',
      '--in', 'SOL',
      '--out', 'USDC',
      '--amount', '1',
      '--json',
    ]);
    expect(stderr).not.toContain('unknown option');
  });
});
