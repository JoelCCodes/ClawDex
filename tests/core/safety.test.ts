import { describe, it, expect } from 'bun:test';
import { validateSafety } from '../../src/core/safety.js';
import type { QuoteResult, SafetyConfig } from '../../src/types.js';
import { SOL_MINT, USDC_MINT, USDT_MINT } from '../../src/constants.js';

function makeQuote(overrides: Partial<QuoteResult> = {}): QuoteResult {
  return {
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    inAmount: '1000000000', // 1 SOL
    outAmount: '23456789',
    otherAmountThreshold: '23222221',
    swapMode: 'ExactIn',
    slippageBps: 50,
    priceImpactPct: '0.01',
    routePlan: [
      {
        swapInfo: {
          ammKey: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
          label: 'Raydium',
          inputMint: SOL_MINT,
          outputMint: USDC_MINT,
          inAmount: '1000000000',
          outAmount: '23456789',
          feeAmount: '5000',
          feeMint: SOL_MINT,
        },
        percent: 100,
      },
    ],
    ...overrides,
  };
}

describe('safety', () => {
  describe('validateSafety', () => {
    it('returns safe=true when all checks pass', () => {
      const quote = makeQuote();
      const config: SafetyConfig = {
        max_fee_bps: 100,
        max_slippage_bps: 100,
        max_price_impact_bps: 50,
        max_trade_sol: 10,
        allowlist: [],
      };

      const result = validateSafety(quote, config);
      expect(result.safe).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('detects max_fee_bps violation', () => {
      const quote = makeQuote({
        platformFee: { amount: '50000', feeBps: 75 },
      });
      const config: SafetyConfig = {
        max_fee_bps: 50,
      };

      const result = validateSafety(quote, config);
      expect(result.safe).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('Platform fee');
      expect(result.violations[0]).toContain('75');
      expect(result.violations[0]).toContain('50');
    });

    it('detects max_slippage_bps violation', () => {
      const quote = makeQuote({ slippageBps: 200 });
      const config: SafetyConfig = {
        max_slippage_bps: 100,
      };

      const result = validateSafety(quote, config);
      expect(result.safe).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('Slippage');
      expect(result.violations[0]).toContain('200');
    });

    it('detects max_price_impact_bps violation', () => {
      // priceImpactPct "0.12" => 12 bps
      const quote = makeQuote({ priceImpactPct: '0.12' });
      const config: SafetyConfig = {
        max_price_impact_bps: 10,
      };

      const result = validateSafety(quote, config);
      expect(result.safe).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('Price impact');
      expect(result.violations[0]).toContain('12');
    });

    it('detects max_trade_sol violation for SOL input', () => {
      // 5 SOL = 5000000000 lamports
      const quote = makeQuote({
        inputMint: SOL_MINT,
        inAmount: '5000000000',
      });
      const config: SafetyConfig = {
        max_trade_sol: 2,
      };

      const result = validateSafety(quote, config);
      expect(result.safe).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('Trade size');
      expect(result.violations[0]).toContain('5');
    });

    it('skips max_trade_sol check for non-SOL inputs', () => {
      const quote = makeQuote({
        inputMint: USDC_MINT,
        inAmount: '999999999999', // Large amount but not SOL
      });
      const config: SafetyConfig = {
        max_trade_sol: 1,
      };

      const result = validateSafety(quote, config);
      expect(result.safe).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('detects allowlist violation', () => {
      const unknownMint = 'UnknownMint1111111111111111111111';
      const quote = makeQuote({ outputMint: unknownMint });
      const config: SafetyConfig = {
        allowlist: [USDC_MINT, USDT_MINT],
      };

      const result = validateSafety(quote, config);
      expect(result.safe).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('not in the allowlist');
      expect(result.violations[0]).toContain(unknownMint);
    });

    it('passes allowlist check when allowlist is empty', () => {
      const quote = makeQuote({ outputMint: 'SomeRandomMint111111111111111111' });
      const config: SafetyConfig = {
        allowlist: [],
      };

      const result = validateSafety(quote, config);
      expect(result.safe).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('collects ALL violations simultaneously', () => {
      const quote = makeQuote({
        platformFee: { amount: '50000', feeBps: 200 },
        slippageBps: 500,
        priceImpactPct: '1.0', // 100 bps
        inputMint: SOL_MINT,
        inAmount: '20000000000', // 20 SOL
        outputMint: 'UnknownMint1111111111111111111111',
      });
      const config: SafetyConfig = {
        max_fee_bps: 50,
        max_slippage_bps: 100,
        max_price_impact_bps: 50,
        max_trade_sol: 10,
        allowlist: [USDC_MINT],
      };

      const result = validateSafety(quote, config);
      expect(result.safe).toBe(false);
      expect(result.violations).toHaveLength(5);
    });

    it('resolves allowlist symbols via KNOWN_TOKENS', () => {
      const quote = makeQuote({ outputMint: USDC_MINT });
      const config: SafetyConfig = {
        allowlist: ['USDC'], // symbol, not mint address
      };

      const result = validateSafety(quote, config);
      expect(result.safe).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });
});
