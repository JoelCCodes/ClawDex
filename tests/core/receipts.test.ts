import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { existsSync } from 'fs';
import { storeReceipt, lookupReceipt, getReceiptsPath } from '../../src/core/receipts.js';
import { createTempDir, cleanupTempDir } from '../helpers.js';
import type { Receipt } from '../../src/types.js';
import { SOL_MINT, USDC_MINT } from '../../src/constants.js';

function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    timestamp: new Date().toISOString(),
    txSignature: 'sig_' + Math.random().toString(36).slice(2),
    inputToken: { symbol: 'SOL', name: 'Solana', mint: SOL_MINT, decimals: 9 },
    outputToken: { symbol: 'USDC', name: 'USD Coin', mint: USDC_MINT, decimals: 6 },
    inputAmount: '1000000000',
    outputAmount: '23456789',
    route: 'Raydium',
    fees: {
      platformFeeBps: 50,
      platformFeeAmount: '11728',
      networkFee: 5000,
    },
    status: 'success',
    ...overrides,
  };
}

describe('receipts', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('storeReceipt', () => {
    it('creates directory if missing', async () => {
      const nestedDir = join(tempDir, 'nested', 'receipts');
      const config = { receipts_dir: nestedDir };
      const receipt = makeReceipt();

      await storeReceipt(receipt, config);

      expect(existsSync(nestedDir)).toBe(true);
    });

    it('appends JSONL line to file', async () => {
      const config = { receipts_dir: tempDir };
      const receipt = makeReceipt({ txSignature: 'test_sig_1' });

      await storeReceipt(receipt, config);

      const filePath = join(tempDir, 'receipts.jsonl');
      const content = await Bun.file(filePath).text();
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]);
      expect(parsed.txSignature).toBe('test_sig_1');
    });

    it('appends multiple receipts each on own line', async () => {
      const config = { receipts_dir: tempDir };

      await storeReceipt(makeReceipt({ txSignature: 'sig_a' }), config);
      await storeReceipt(makeReceipt({ txSignature: 'sig_b' }), config);
      await storeReceipt(makeReceipt({ txSignature: 'sig_c' }), config);

      const filePath = join(tempDir, 'receipts.jsonl');
      const content = await Bun.file(filePath).text();
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);

      expect(JSON.parse(lines[0]).txSignature).toBe('sig_a');
      expect(JSON.parse(lines[1]).txSignature).toBe('sig_b');
      expect(JSON.parse(lines[2]).txSignature).toBe('sig_c');
    });
  });

  describe('lookupReceipt', () => {
    it('finds matching tx signature', async () => {
      const config = { receipts_dir: tempDir };
      const receipt = makeReceipt({ txSignature: 'target_sig' });

      await storeReceipt(makeReceipt({ txSignature: 'other_sig' }), config);
      await storeReceipt(receipt, config);

      const found = await lookupReceipt('target_sig', config);
      expect(found).not.toBeNull();
      expect(found!.txSignature).toBe('target_sig');
    });

    it('returns null for non-existent signature', async () => {
      const config = { receipts_dir: tempDir };
      await storeReceipt(makeReceipt({ txSignature: 'existing_sig' }), config);

      const found = await lookupReceipt('nonexistent_sig', config);
      expect(found).toBeNull();
    });

    it('returns null when file does not exist', async () => {
      const config = { receipts_dir: join(tempDir, 'nonexistent') };

      const found = await lookupReceipt('any_sig', config);
      expect(found).toBeNull();
    });
  });

  describe('getReceiptsPath', () => {
    it('returns correct path from config', () => {
      const path = getReceiptsPath({ receipts_dir: '/custom/dir' });
      expect(path).toBe('/custom/dir/receipts.jsonl');
    });

    it('returns default path when no config provided', () => {
      const path = getReceiptsPath();
      expect(path).toContain('receipts.jsonl');
    });

    it('expands tilde in config path', () => {
      const path = getReceiptsPath({ receipts_dir: '~/my-receipts' });
      expect(path).not.toContain('~');
      expect(path).toContain('my-receipts/receipts.jsonl');
    });
  });
});
