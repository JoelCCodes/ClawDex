import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { Keypair } from '@solana/web3.js';
import { parse as parseToml } from '@iarna/toml';

const CLI = join(import.meta.dir, '../../src/cli.ts');

let tempDir: string;
let env: Record<string, string>;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'clawdex-cmd-onboarding-'));
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

/** Pre-seed the Jupiter token cache so fetchTokenList doesn't hit the network */
function seedTokenCache() {
  const cacheDir = join(tempDir, '.clawdex');
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const cache = {
    timestamp: Date.now(),
    tokens: [
      { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Solana', decimals: 9 },
      { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    ],
  };
  writeFileSync(join(cacheDir, 'token-cache.json'), JSON.stringify(cache), 'utf-8');
}

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

function makeWallet(): { keypair: Keypair; path: string } {
  const keypair = Keypair.generate();
  const path = join(tempDir, 'wallet.json');
  writeFileSync(path, JSON.stringify(Array.from(keypair.secretKey)), { mode: 0o600 });
  return { keypair, path };
}

describe('onboarding', () => {
  it('produces valid JSON output with all required flags', async () => {
    seedTokenCache();
    const { keypair, path: walletPath } = makeWallet();

    const { stdout, exitCode } = await run([
      'onboarding',
      '--jupiter-api-key', 'test-key-12345678',
      '--rpc', 'https://api.mainnet-beta.solana.com',
      '--wallet', walletPath,
      '--json',
    ]);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.config).toBeDefined();
    expect(parsed.validation).toBeDefined();
    expect(parsed.validation.wallet.valid).toBe(true);
    expect(parsed.validation.wallet.pubkey).toBe(keypair.publicKey.toBase58());
    expect(parsed.validation.jupiter_api_key.valid).toBe(true);
    expect(parsed.validation.jupiter_api_key.token_count).toBe(2);

    // If RPC was reachable, config should have been written
    if (parsed.validation.rpc.healthy) {
      expect(exitCode).toBe(0);
      expect(parsed.success).toBe(true);
      expect(parsed.validation.config_written).toBe(true);
    }
  });

  it('fails with exit 5 when missing --jupiter-api-key in non-TTY', async () => {
    const { path: walletPath } = makeWallet();

    const { exitCode, stderr } = await run([
      'onboarding',
      '--rpc', 'https://api.mainnet-beta.solana.com',
      '--wallet', walletPath,
      '--json',
    ]);
    expect(exitCode).toBe(5);
    expect(stderr).toContain('--jupiter-api-key');
  });

  it('fails with exit 5 when missing --wallet and no --generate-wallet in non-TTY', async () => {
    const { exitCode, stderr } = await run([
      'onboarding',
      '--jupiter-api-key', 'test-key',
      '--rpc', 'https://api.mainnet-beta.solana.com',
      '--json',
    ]);
    expect(exitCode).toBe(5);
    expect(stderr).toContain('--wallet');
  });

  it('generates wallet with --generate-wallet + --json', async () => {
    seedTokenCache();
    const walletOutput = join(tempDir, 'gen-wallet.json');
    const { stdout } = await run([
      'onboarding',
      '--jupiter-api-key', 'test-key-12345678',
      '--rpc', 'https://api.mainnet-beta.solana.com',
      '--generate-wallet',
      '--wallet-output', walletOutput,
      '--json',
    ]);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.config.wallet_generated).toBe(true);
    expect(existsSync(walletOutput)).toBe(true);

    // Verify the generated file is a valid keypair
    const raw = JSON.parse(readFileSync(walletOutput, 'utf-8'));
    expect(Array.isArray(raw)).toBe(true);
    expect(raw.length).toBe(64);
  });

  it('refuses to overwrite existing wallet file with --generate-wallet', async () => {
    const walletOutput = join(tempDir, 'existing-wallet.json');
    await Bun.write(walletOutput, '[]');

    const { exitCode, stderr } = await run([
      'onboarding',
      '--jupiter-api-key', 'test-key',
      '--rpc', 'https://api.mainnet-beta.solana.com',
      '--generate-wallet',
      '--wallet-output', walletOutput,
      '--json',
    ]);
    expect(exitCode).toBe(5);
    expect(stderr).toContain('already exists');
  });

  it('reports validation failure for invalid wallet path', async () => {
    seedTokenCache();
    const { stdout, exitCode } = await run([
      'onboarding',
      '--jupiter-api-key', 'test-key-12345678',
      '--rpc', 'https://api.mainnet-beta.solana.com',
      '--wallet', '/nonexistent/wallet.json',
      '--json',
    ]);
    expect(exitCode).toBe(5);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.success).toBe(false);
    expect(parsed.validation.wallet.valid).toBe(false);
    expect(parsed.validation.config_written).toBe(false);
  });

  it('writes safety values to TOML when provided', async () => {
    seedTokenCache();
    const { path: walletPath } = makeWallet();

    const { stdout, exitCode } = await run([
      'onboarding',
      '--jupiter-api-key', 'test-key-12345678',
      '--rpc', 'https://api.mainnet-beta.solana.com',
      '--wallet', walletPath,
      '--max-slippage-bps', '300',
      '--max-trade-sol', '10',
      '--max-price-impact-bps', '500',
      '--json',
    ]);

    const parsed = JSON.parse(stdout.trim());
    // Only check TOML if config was actually written (requires RPC to be healthy)
    if (parsed.validation.config_written) {
      expect(exitCode).toBe(0);
      const configPath = join(tempDir, '.clawdex', 'config.toml');
      const toml = parseToml(readFileSync(configPath, 'utf-8'));
      const safety = toml.safety as Record<string, unknown>;
      expect(safety.max_slippage_bps).toBe(300);
      expect(safety.max_trade_sol).toBe(10);
      expect(safety.max_price_impact_bps).toBe(500);
    }
  });

  it('uses defaults for optional flags', async () => {
    seedTokenCache();
    const { path: walletPath } = makeWallet();

    const { stdout } = await run([
      'onboarding',
      '--jupiter-api-key', 'test-key-12345678',
      '--rpc', 'https://api.mainnet-beta.solana.com',
      '--wallet', walletPath,
      '--json',
    ]);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.config.fee_bps).toBe(20);
  });

  it('masks API key in JSON output', async () => {
    seedTokenCache();
    const { path: walletPath } = makeWallet();

    const { stdout } = await run([
      'onboarding',
      '--jupiter-api-key', 'test-key-12345678',
      '--rpc', 'https://api.mainnet-beta.solana.com',
      '--wallet', walletPath,
      '--json',
    ]);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.config.jupiter_api_key).toContain('***');
    expect(parsed.config.jupiter_api_key).not.toBe('test-key-12345678');
  });

  it('--help works and shows description', async () => {
    const { stdout, exitCode } = await run(['onboarding', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Configure ClawDex');
  });

  it('validation continues past first failure', async () => {
    seedTokenCache();
    const { stdout, exitCode } = await run([
      'onboarding',
      '--jupiter-api-key', 'test-key-12345678',
      '--rpc', 'https://api.mainnet-beta.solana.com',
      '--wallet', '/nonexistent/wallet.json',
      '--json',
    ]);
    expect(exitCode).toBe(5);

    const parsed = JSON.parse(stdout.trim());
    // Jupiter and RPC should still have been validated even though wallet failed
    expect(parsed.validation.jupiter_api_key).toBeDefined();
    expect(parsed.validation.rpc).toBeDefined();
    expect(parsed.validation.wallet.valid).toBe(false);
  });
});
