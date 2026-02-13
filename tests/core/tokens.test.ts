import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp, rm } from 'fs/promises';

// Mock os.homedir so token cache resolves to temp dir
let _fakeHome = '/tmp/placeholder';
mock.module('os', () => {
  const realOs = require('os');
  return {
    ...realOs,
    homedir: () => _fakeHome,
  };
});

import { resolveToken, isValidBase58, fetchTokenList } from '../../src/core/tokens.js';
import { SOL_MINT, USDC_MINT, USDT_MINT } from '../../src/constants.js';

let tempDir: string;
const origFetch = globalThis.fetch;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'clawdex-test-'));
  _fakeHome = tempDir;
});

afterEach(async () => {
  globalThis.fetch = origFetch;
  await rm(tempDir, { recursive: true, force: true });
});

function mockFetch(tokens: Array<{ id: string; symbol: string; name: string; decimals: number }>) {
  const fn = mock(() =>
    Promise.resolve(new Response(JSON.stringify(tokens), { status: 200 }))
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('isValidBase58', () => {
  it('validates correct Solana addresses', () => {
    expect(isValidBase58(SOL_MINT)).toBe(true);
    expect(isValidBase58(USDC_MINT)).toBe(true);
    expect(isValidBase58(USDT_MINT)).toBe(true);
    expect(isValidBase58('11111111111111111111111111111111')).toBe(true);
  });

  it('rejects invalid strings', () => {
    expect(isValidBase58('')).toBe(false);
    expect(isValidBase58('short')).toBe(false);
    // 0, O, I, l are not in base58
    expect(isValidBase58('0' + 'A'.repeat(31))).toBe(false);
    expect(isValidBase58('O' + 'A'.repeat(31))).toBe(false);
    expect(isValidBase58('I' + 'A'.repeat(31))).toBe(false);
    expect(isValidBase58('l' + 'A'.repeat(31))).toBe(false);
    expect(isValidBase58('contains spaces here padding pad')).toBe(false);
  });
});

describe('resolveToken', () => {
  it('resolveToken("SOL") returns hardcoded SOL info', async () => {
    const token = await resolveToken('SOL');
    expect(token.symbol).toBe('SOL');
    expect(token.name).toBe('Solana');
    expect(token.mint).toBe(SOL_MINT);
    expect(token.decimals).toBe(9);
  });

  it('resolveToken("sol") is case-insensitive', async () => {
    const token = await resolveToken('sol');
    expect(token.symbol).toBe('SOL');
    expect(token.mint).toBe(SOL_MINT);
  });

  it('resolveToken("USDC") returns hardcoded USDC info', async () => {
    const token = await resolveToken('USDC');
    expect(token.symbol).toBe('USDC');
    expect(token.name).toBe('USD Coin');
    expect(token.mint).toBe(USDC_MINT);
    expect(token.decimals).toBe(6);
  });

  it('resolveToken("USDT") returns hardcoded USDT info', async () => {
    const token = await resolveToken('USDT');
    expect(token.symbol).toBe('USDT');
    expect(token.name).toBe('Tether USD');
    expect(token.mint).toBe(USDT_MINT);
    expect(token.decimals).toBe(6);
  });

  it('resolves raw mint address via Jupiter list', async () => {
    const fakeMint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    mockFetch([
      { id: fakeMint, symbol: 'BONK', name: 'Bonk', decimals: 5 },
    ]);

    const token = await resolveToken(fakeMint);
    expect(token.symbol).toBe('BONK');
    expect(token.name).toBe('Bonk');
    expect(token.mint).toBe(fakeMint);
    expect(token.decimals).toBe(5);
  });

  it('throws "Token not found" for nonexistent token', async () => {
    expect(resolveToken('NONEXISTENT')).rejects.toThrow('Token not found');
  });

  it('second call uses cache (fetch only called once)', async () => {
    const fakeMint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    const fetchFn = mockFetch([
      { id: fakeMint, symbol: 'BONK', name: 'Bonk', decimals: 5 },
    ]);

    // First call - triggers fetch and writes cache
    await resolveToken(fakeMint);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Second call - should read from cache file, not fetch again
    const token2 = await resolveToken(fakeMint);
    expect(token2.symbol).toBe('BONK');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
