import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { Keypair } from '@solana/web3.js';

const CLI = join(import.meta.dir, '../../src/cli.ts');

let tempDir: string;
let env: Record<string, string>;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'clawdex-cmd-status-'));
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

describe('status', () => {
  it('runs status command and shows RPC info', async () => {
    const { stdout, exitCode } = await run(['status']);
    // Status will attempt real RPC connection - may fail or succeed
    // but the command should run and produce output
    expect(stdout).toContain('RPC:');
    expect(stdout).toContain('Wallet:');
    expect(stdout).toContain('Fee:');
    expect(stdout).toContain('Tokens:');
  });

  it('returns JSON with --json flag', async () => {
    const { stdout } = await run(['status', '--json']);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed).toHaveProperty('rpc');
    expect(parsed).toHaveProperty('wallet');
    expect(parsed).toHaveProperty('fee_account');
    expect(parsed).toHaveProperty('token_list');
    expect(parsed.rpc).toHaveProperty('url');
    expect(parsed.rpc).toHaveProperty('healthy');
    expect(parsed.rpc).toHaveProperty('latency_ms');
  });

  it('reports wallet as configured when --wallet is provided', async () => {
    // Create a temp keypair file
    const keypair = Keypair.generate();
    const keypairPath = join(tempDir, 'wallet.json');
    await Bun.write(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));

    const { stdout } = await run(['status', '--json', '--wallet', keypairPath]);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.wallet.configured).toBe(true);
    expect(parsed.wallet.pubkey).toBe(keypair.publicKey.toBase58());
  });

  it('reports wallet as not configured when no wallet set', async () => {
    const { stdout } = await run(['status', '--json']);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.wallet.configured).toBe(false);
  });

  it('exits with code 1 when there are failures (no wallet configured)', async () => {
    const { exitCode } = await run(['status']);
    // No wallet configured = failure
    expect(exitCode).toBe(1);
  });

  it('exits with code 1 when RPC is unreachable', async () => {
    env.CLAWDEX_RPC = 'http://127.0.0.1:1';
    const { exitCode, stdout } = await run(['status', '--json']);
    expect(exitCode).toBe(1);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.rpc.healthy).toBe(false);
    expect(parsed.rpc.latency_ms).toBeNull();
  });

  it('includes RPC URL in JSON output', async () => {
    env.CLAWDEX_RPC = 'https://custom-rpc.example.com';
    const { stdout } = await run(['status', '--json']);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.rpc.url).toBe('https://custom-rpc.example.com');
  });
});
