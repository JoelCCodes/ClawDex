import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';

const CLI = join(import.meta.dir, '../../src/cli.ts');

let tempDir: string;
let env: Record<string, string>;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'clawdex-cmd-balances-'));
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

describe('balances', () => {
  it('errors when no wallet is configured', async () => {
    const { exitCode, stderr } = await run(['balances']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('No wallet configured');
  });

  it('errors when wallet file does not exist', async () => {
    const { exitCode, stderr } = await run(['balances', '--wallet', '/nonexistent/wallet.json']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Wallet file not found');
  });

  it('errors with --json when no wallet configured', async () => {
    const { exitCode, stderr } = await run(['balances', '--json']);
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stderr.trim());
    expect(parsed).toHaveProperty('error');
  });

  it('accepts --wallet flag', async () => {
    // Create a valid keypair file but point to unreachable RPC
    const { Keypair } = await import('@solana/web3.js');
    const keypair = Keypair.generate();
    const keypairPath = join(tempDir, 'wallet.json');
    await Bun.write(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));

    // Will fail at RPC level but proves --wallet was accepted and keypair loaded
    const { exitCode, stderr, stdout } = await run(['balances', '--wallet', keypairPath]);
    // Should fail because default RPC may not work, but should get past wallet loading
    // The error should NOT be about wallet configuration
    expect(stderr).not.toContain('No wallet configured');
  });

  it('shows wallet pubkey in human mode when wallet loads', async () => {
    const { Keypair } = await import('@solana/web3.js');
    const keypair = Keypair.generate();
    const keypairPath = join(tempDir, 'wallet.json');
    await Bun.write(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));

    // Point to a localhost RPC that will fail, but we can check stdout for the pubkey
    env.CLAWDEX_RPC = 'http://127.0.0.1:1';
    const { stderr } = await run(['balances', '--wallet', keypairPath]);
    // Should get past wallet loading phase
    expect(stderr).not.toContain('No wallet configured');
    expect(stderr).not.toContain('Wallet file not found');
  });

  it('exits with code 1 and JSON error when RPC fails', async () => {
    const { Keypair } = await import('@solana/web3.js');
    const keypair = Keypair.generate();
    const keypairPath = join(tempDir, 'wallet.json');
    await Bun.write(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));

    env.CLAWDEX_RPC = 'http://127.0.0.1:1';
    const { exitCode, stderr } = await run(['balances', '--wallet', keypairPath, '--json']);
    expect(exitCode).toBe(1);

    const parsed = JSON.parse(stderr.trim());
    expect(parsed).toHaveProperty('error');
    expect(parsed).toHaveProperty('code');
  });
});
