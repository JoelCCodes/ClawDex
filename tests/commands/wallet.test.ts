import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { existsSync, readFileSync } from 'fs';
import { Keypair } from '@solana/web3.js';

const CLI = join(import.meta.dir, '../../src/cli.ts');

let tempDir: string;
let env: Record<string, string>;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'clawdex-cmd-wallet-'));
  env = {
    ...process.env as Record<string, string>,
    HOME: tempDir,
  };
  delete env.CLAWDEX_RPC;
  delete env.CLAWDEX_WALLET;
  delete env.CLAWDEX_FEE_BPS;
  delete env.CLAWDEX_FEE_ACCOUNT;
  delete env.CLAWDEX_RECEIPTS_DIR;
  delete env.JUPITER_API_KEY;
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

describe('wallet', () => {
  it('shows wallet info with --json when wallet is configured', async () => {
    const keypair = Keypair.generate();
    const keypairPath = join(tempDir, 'wallet.json');
    await Bun.write(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));

    env.CLAWDEX_WALLET = keypairPath;
    const { stdout, exitCode } = await run(['wallet', '--json']);
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.pubkey).toBe(keypair.publicKey.toBase58());
    expect(parsed.path).toBe(keypairPath);
  });

  it('exits with code 1 when no wallet configured', async () => {
    const { exitCode, stderr } = await run(['wallet', '--json']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('No wallet configured');
  });

  it('generates a wallet with wallet generate --json', async () => {
    const outPath = join(tempDir, 'new-wallet.json');
    const { stdout, exitCode } = await run(['wallet', 'generate', '--output', outPath, '--json']);
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.generated).toBe(true);
    expect(parsed.pubkey).toBeString();
    expect(parsed.pubkey.length).toBeGreaterThan(30);
    expect(existsSync(outPath)).toBe(true);

    // Verify the file contains a valid keypair
    const raw = JSON.parse(readFileSync(outPath, 'utf-8'));
    expect(Array.isArray(raw)).toBe(true);
    expect(raw.length).toBe(64);
  });

  it('generates wallet at custom --output path', async () => {
    const outPath = join(tempDir, 'subdir', 'my-wallet.json');
    const { stdout, exitCode } = await run(['wallet', 'generate', '--output', outPath, '--json']);
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.path).toBe(outPath);
    expect(existsSync(outPath)).toBe(true);
  });

  it('refuses to overwrite existing file on generate', async () => {
    const outPath = join(tempDir, 'existing.json');
    await Bun.write(outPath, '[]');

    const { exitCode, stderr } = await run(['wallet', 'generate', '--output', outPath, '--json']);
    expect(exitCode).toBe(5);
    expect(stderr).toContain('already exists');
  });

  it('--help lists both default action and generate subcommand', async () => {
    const { stdout, exitCode } = await run(['wallet', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Wallet info and generation');
    expect(stdout).toContain('generate');
  });
});
