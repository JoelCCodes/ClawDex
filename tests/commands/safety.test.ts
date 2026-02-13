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
  tempDir = await mkdtemp(join(tmpdir(), 'clawdex-cmd-safety-'));
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

describe('safety set', () => {
  it('sets max_fee_bps value', async () => {
    const { exitCode } = await run(['safety', 'set', 'max_fee_bps=100']);
    expect(exitCode).toBe(0);

    const configPath = join(tempDir, '.clawdex', 'config.toml');
    const parsed = parseToml(readFileSync(configPath, 'utf-8'));
    const safety = parsed.safety as Record<string, unknown>;
    expect(safety.max_fee_bps).toBe(100);
  });

  it('sets multiple safety values', async () => {
    const { exitCode } = await run(['safety', 'set', 'max_fee_bps=100', 'max_slippage_bps=300']);
    expect(exitCode).toBe(0);

    const configPath = join(tempDir, '.clawdex', 'config.toml');
    const parsed = parseToml(readFileSync(configPath, 'utf-8'));
    const safety = parsed.safety as Record<string, unknown>;
    expect(safety.max_fee_bps).toBe(100);
    expect(safety.max_slippage_bps).toBe(300);
  });

  it('sets allowlist as comma-separated values', async () => {
    const { exitCode } = await run(['safety', 'set', 'allowlist=SOL,USDC,USDT']);
    expect(exitCode).toBe(0);

    const configPath = join(tempDir, '.clawdex', 'config.toml');
    const parsed = parseToml(readFileSync(configPath, 'utf-8'));
    const safety = parsed.safety as Record<string, unknown>;
    expect(safety.allowlist).toEqual(['SOL', 'USDC', 'USDT']);
  });

  it('rejects invalid key', async () => {
    const { exitCode, stderr } = await run(['safety', 'set', 'invalid_key=123']);
    expect(exitCode).toBe(5);
    expect(stderr).toContain('Unknown safety key');
  });

  it('rejects non-numeric value for numeric key', async () => {
    const { exitCode, stderr } = await run(['safety', 'set', 'max_fee_bps=abc']);
    expect(exitCode).toBe(5);
    expect(stderr).toContain('must be a number');
  });

  it('outputs JSON with --json flag', async () => {
    const { stdout, exitCode } = await run(['safety', 'set', 'max_fee_bps=100', '--json']);
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.success).toBe(true);
    expect(parsed.updated).toBeArray();
    expect(parsed.updated[0].key).toBe('max_fee_bps');
  });

  it('rejects invalid format (no =)', async () => {
    const { exitCode, stderr } = await run(['safety', 'set', 'noequals']);
    expect(exitCode).toBe(5);
    expect(stderr).toContain('Invalid format');
  });
});
