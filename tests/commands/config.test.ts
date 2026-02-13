import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { readFileSync } from 'fs';
import { parse as parseToml } from '@iarna/toml';

const CLI = join(import.meta.dir, '../../src/cli.ts');

let tempDir: string;
let env: Record<string, string>;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'clawdex-cmd-config-'));
  env = {
    ...process.env as Record<string, string>,
    HOME: tempDir,
  };
  // Clear any CLAWDEX env vars
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

describe('config set', () => {
  it('sets rpc value correctly', async () => {
    const { exitCode } = await run(['config', 'set', 'rpc=https://my-rpc.example.com']);
    expect(exitCode).toBe(0);

    const configPath = join(tempDir, '.clawdex', 'config.toml');
    const parsed = parseToml(readFileSync(configPath, 'utf-8'));
    expect(parsed.rpc).toBe('https://my-rpc.example.com');
  });

  it('sets multiple values at once', async () => {
    const { exitCode } = await run(['config', 'set', 'rpc=https://rpc.test', 'wallet=~/w.json']);
    expect(exitCode).toBe(0);

    const configPath = join(tempDir, '.clawdex', 'config.toml');
    const parsed = parseToml(readFileSync(configPath, 'utf-8'));
    expect(parsed.rpc).toBe('https://rpc.test');
    expect(parsed.wallet).toBe('~/w.json');
  });

  it('sets fee_bps as a number', async () => {
    const { exitCode } = await run(['config', 'set', 'fee_bps=42']);
    expect(exitCode).toBe(0);

    const configPath = join(tempDir, '.clawdex', 'config.toml');
    const parsed = parseToml(readFileSync(configPath, 'utf-8'));
    expect(parsed.fee_bps).toBe(42);
  });

  it('rejects invalid key', async () => {
    const { exitCode, stderr } = await run(['config', 'set', 'bogus_key=value']);
    expect(exitCode).toBe(5);
    expect(stderr).toContain('Unknown config key');
  });

  it('rejects invalid format (no =)', async () => {
    const { exitCode, stderr } = await run(['config', 'set', 'noequals']);
    expect(exitCode).toBe(5);
    expect(stderr).toContain('Invalid format');
  });

  it('outputs JSON with --json flag', async () => {
    const { stdout, exitCode } = await run(['config', 'set', 'rpc=https://rpc.test', '--json']);
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.success).toBe(true);
    expect(parsed.updated).toBeArray();
    expect(parsed.updated[0].key).toBe('rpc');
    expect(parsed.updated[0].value).toBe('https://rpc.test');
  });
});
