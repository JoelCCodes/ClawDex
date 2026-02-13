import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { join } from 'path';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { mkdtemp, rm } from 'fs/promises';
import { parse as parseToml } from '@iarna/toml';

// We need to mock os.homedir() before config.ts is loaded so expandHome resolves to our temp dir.
let _fakeHome = '/tmp/placeholder';
mock.module('os', () => {
  const realOs = require('os');
  return {
    ...realOs,
    homedir: () => _fakeHome,
  };
});

// Now import config functions - they will use our mocked homedir
import {
  expandHome,
  getDefaultConfig,
  loadConfig,
  resolveConfig,
  setConfigValue,
  setSafetyValue,
} from '../../src/core/config.js';
import { DEFAULT_RPC, DEFAULT_FEE_BPS, RECEIPTS_DIR } from '../../src/constants.js';

let tempDir: string;
let origEnvRpc: string | undefined;
let origEnvWallet: string | undefined;
let origEnvFeeBps: string | undefined;
let origEnvFeeAccount: string | undefined;
let origEnvReceiptsDir: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'clawdex-test-'));
  _fakeHome = tempDir;

  // Save and clear CLAWDEX env vars
  origEnvRpc = process.env.CLAWDEX_RPC;
  origEnvWallet = process.env.CLAWDEX_WALLET;
  origEnvFeeBps = process.env.CLAWDEX_FEE_BPS;
  origEnvFeeAccount = process.env.CLAWDEX_FEE_ACCOUNT;
  origEnvReceiptsDir = process.env.CLAWDEX_RECEIPTS_DIR;
  delete process.env.CLAWDEX_RPC;
  delete process.env.CLAWDEX_WALLET;
  delete process.env.CLAWDEX_FEE_BPS;
  delete process.env.CLAWDEX_FEE_ACCOUNT;
  delete process.env.CLAWDEX_RECEIPTS_DIR;
});

afterEach(async () => {
  // Restore env vars
  if (origEnvRpc !== undefined) process.env.CLAWDEX_RPC = origEnvRpc; else delete process.env.CLAWDEX_RPC;
  if (origEnvWallet !== undefined) process.env.CLAWDEX_WALLET = origEnvWallet; else delete process.env.CLAWDEX_WALLET;
  if (origEnvFeeBps !== undefined) process.env.CLAWDEX_FEE_BPS = origEnvFeeBps; else delete process.env.CLAWDEX_FEE_BPS;
  if (origEnvFeeAccount !== undefined) process.env.CLAWDEX_FEE_ACCOUNT = origEnvFeeAccount; else delete process.env.CLAWDEX_FEE_ACCOUNT;
  if (origEnvReceiptsDir !== undefined) process.env.CLAWDEX_RECEIPTS_DIR = origEnvReceiptsDir; else delete process.env.CLAWDEX_RECEIPTS_DIR;

  await rm(tempDir, { recursive: true, force: true });
});

describe('expandHome', () => {
  it('expands ~ to home directory', () => {
    const result = expandHome('~/foo/bar');
    expect(result).toBe(join(tempDir, 'foo/bar'));
  });

  it('returns non-tilde paths unchanged', () => {
    expect(expandHome('/absolute/path')).toBe('/absolute/path');
    expect(expandHome('relative/path')).toBe('relative/path');
  });
});

describe('loadConfig', () => {
  it('returns defaults when no config file exists', () => {
    const config = loadConfig();
    expect(config.rpc).toBe(DEFAULT_RPC);
    expect(config.wallet).toBe('');
    expect(config.fee_bps).toBe(DEFAULT_FEE_BPS);
    expect(config.fee_account).toBe('');
    expect(config.receipts_dir).toBe(RECEIPTS_DIR);
    expect(config.safety).toEqual({});
  });

  it('parses valid TOML config correctly', async () => {
    const clawdexDir = join(tempDir, '.clawdex');
    await Bun.write(join(clawdexDir, 'config.toml'), [
      'rpc = "https://custom-rpc.example.com"',
      'wallet = "~/my-wallet.json"',
      'fee_bps = 50',
      'fee_account = "FeeAcct123"',
      'receipts_dir = "~/receipts"',
      '',
      '[safety]',
      'max_fee_bps = 100',
      'max_slippage_bps = 300',
      'allowlist = ["SOL", "USDC"]',
    ].join('\n'));

    const config = loadConfig();
    expect(config.rpc).toBe('https://custom-rpc.example.com');
    expect(config.wallet).toBe('~/my-wallet.json');
    expect(config.fee_bps).toBe(50);
    expect(config.fee_account).toBe('FeeAcct123');
    expect(config.receipts_dir).toBe('~/receipts');
    expect(config.safety.max_fee_bps).toBe(100);
    expect(config.safety.max_slippage_bps).toBe(300);
    expect(config.safety.allowlist).toEqual(['SOL', 'USDC']);
  });
});

describe('resolveConfig', () => {
  it('uses defaults when no config, env, or flags exist', () => {
    const config = resolveConfig();
    expect(config.rpc).toBe(DEFAULT_RPC);
    expect(config.fee_bps).toBe(DEFAULT_FEE_BPS);
  });

  it('config file overrides defaults', async () => {
    const clawdexDir = join(tempDir, '.clawdex');
    await Bun.write(join(clawdexDir, 'config.toml'), 'rpc = "https://file-rpc.com"\nfee_bps = 25\n');

    const config = resolveConfig();
    expect(config.rpc).toBe('https://file-rpc.com');
    expect(config.fee_bps).toBe(25);
  });

  it('env vars override config file', async () => {
    const clawdexDir = join(tempDir, '.clawdex');
    await Bun.write(join(clawdexDir, 'config.toml'), 'rpc = "https://file-rpc.com"\n');

    process.env.CLAWDEX_RPC = 'https://env-rpc.com';
    const config = resolveConfig();
    expect(config.rpc).toBe('https://env-rpc.com');
  });

  it('CLI flags override env vars', () => {
    process.env.CLAWDEX_RPC = 'https://env-rpc.com';
    const config = resolveConfig({ rpc: 'https://flag-rpc.com' });
    expect(config.rpc).toBe('https://flag-rpc.com');
  });

  it('rejects RPC not in rpc_allowlist', async () => {
    const clawdexDir = join(tempDir, '.clawdex');
    await Bun.write(join(clawdexDir, 'config.toml'), [
      'rpc = "https://evil-rpc.com"',
      '',
      '[safety]',
      'rpc_allowlist = ["https://allowed-rpc.com", "https://also-allowed.com"]',
    ].join('\n'));

    expect(() => resolveConfig()).toThrow('not in the allowed list');
  });

  it('allows RPC in rpc_allowlist', async () => {
    const clawdexDir = join(tempDir, '.clawdex');
    await Bun.write(join(clawdexDir, 'config.toml'), [
      'rpc = "https://allowed-rpc.com"',
      '',
      '[safety]',
      'rpc_allowlist = ["https://allowed-rpc.com"]',
    ].join('\n'));

    const config = resolveConfig();
    expect(config.rpc).toBe('https://allowed-rpc.com');
  });
});

describe('setConfigValue', () => {
  it('creates config dir and file if missing', () => {
    setConfigValue('rpc', 'https://new-rpc.com');
    const filePath = join(tempDir, '.clawdex', 'config.toml');
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseToml(content);
    expect(parsed.rpc).toBe('https://new-rpc.com');
  });

  it('updates existing value while preserving others', async () => {
    const clawdexDir = join(tempDir, '.clawdex');
    await Bun.write(join(clawdexDir, 'config.toml'), 'rpc = "https://old.com"\nwallet = "~/w.json"\n');

    setConfigValue('rpc', 'https://new.com');
    const content = readFileSync(join(clawdexDir, 'config.toml'), 'utf-8');
    const parsed = parseToml(content);
    expect(parsed.rpc).toBe('https://new.com');
    expect(parsed.wallet).toBe('~/w.json');
  });

  it('rejects unknown keys', () => {
    expect(() => setConfigValue('bogus_key', 'value')).toThrow('Unknown config key');
  });

  it('validates fee_bps is numeric', () => {
    expect(() => setConfigValue('fee_bps', 'not-a-number')).toThrow('fee_bps must be a non-negative number');
  });

  it('validates fee_bps is non-negative', () => {
    expect(() => setConfigValue('fee_bps', '-5')).toThrow('fee_bps must be a non-negative number');
  });

  it('stores fee_bps as a number in TOML', () => {
    setConfigValue('fee_bps', '42');
    const filePath = join(tempDir, '.clawdex', 'config.toml');
    const parsed = parseToml(readFileSync(filePath, 'utf-8'));
    expect(parsed.fee_bps).toBe(42);
    expect(typeof parsed.fee_bps).toBe('number');
  });
});

describe('setSafetyValue', () => {
  it('sets numeric safety values', () => {
    setSafetyValue('max_fee_bps', '100');
    const filePath = join(tempDir, '.clawdex', 'config.toml');
    const parsed = parseToml(readFileSync(filePath, 'utf-8'));
    const safety = parsed.safety as Record<string, unknown>;
    expect(safety.max_fee_bps).toBe(100);
  });

  it('rejects non-numeric values for numeric keys', () => {
    expect(() => setSafetyValue('max_fee_bps', 'abc')).toThrow('must be a number');
  });

  it('parses comma-separated allowlist', () => {
    setSafetyValue('allowlist', 'SOL, USDC, USDT');
    const filePath = join(tempDir, '.clawdex', 'config.toml');
    const parsed = parseToml(readFileSync(filePath, 'utf-8'));
    const safety = parsed.safety as Record<string, unknown>;
    expect(safety.allowlist).toEqual(['SOL', 'USDC', 'USDT']);
  });

  it('parses comma-separated rpc_allowlist', () => {
    setSafetyValue('rpc_allowlist', 'https://a.com,https://b.com');
    const filePath = join(tempDir, '.clawdex', 'config.toml');
    const parsed = parseToml(readFileSync(filePath, 'utf-8'));
    const safety = parsed.safety as Record<string, unknown>;
    expect(safety.rpc_allowlist).toEqual(['https://a.com', 'https://b.com']);
  });

  it('rejects unknown safety keys', () => {
    expect(() => setSafetyValue('unknown_key', '123')).toThrow('Unknown safety key');
  });
});
