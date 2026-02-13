import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Keypair } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import { getQuote, getSwapTransaction, amountToSmallestUnit, deriveFeeAta } from '../../src/core/jupiter.js';
import { JUPITER_QUOTE_URL, JUPITER_SWAP_URL, USDC_MINT } from '../../src/constants.js';
import mockQuoteResponse from '../fixtures/mock-jupiter-quote.json';
import mockSwapResponse from '../fixtures/mock-jupiter-swap.json';

const originalFetch = globalThis.fetch;

describe('jupiter', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('getQuote', () => {
    it('sends correct query params', async () => {
      let capturedUrl = '';
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        capturedUrl = typeof url === 'string' ? url : url.toString();
        return new Response(JSON.stringify(mockQuoteResponse), { status: 200 });
      }) as unknown as typeof fetch;

      await getQuote({
        inputMint: 'So11111111111111111111111111111111',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000000',
        slippageBps: 50,
      });

      const parsed = new URL(capturedUrl);
      expect(parsed.searchParams.get('inputMint')).toBe('So11111111111111111111111111111111');
      expect(parsed.searchParams.get('outputMint')).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      expect(parsed.searchParams.get('amount')).toBe('1000000000');
      expect(parsed.searchParams.get('slippageBps')).toBe('50');
    });

    it('returns parsed QuoteResult from response', async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify(mockQuoteResponse), { status: 200 });
      }) as unknown as typeof fetch;

      const result = await getQuote({
        inputMint: 'So11111111111111111111111111111111',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000000',
        slippageBps: 50,
      });

      expect(result.inputMint).toBe(mockQuoteResponse.inputMint);
      expect(result.outputMint).toBe(mockQuoteResponse.outputMint);
      expect(result.inAmount).toBe(mockQuoteResponse.inAmount);
      expect(result.outAmount).toBe(mockQuoteResponse.outAmount);
      expect(result.slippageBps).toBe(mockQuoteResponse.slippageBps);
      expect(result.priceImpactPct).toBe(mockQuoteResponse.priceImpactPct);
      expect(result.routePlan).toHaveLength(1);
    });

    it('includes platformFeeBps in params when > 0', async () => {
      let capturedUrl = '';
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        capturedUrl = typeof url === 'string' ? url : url.toString();
        return new Response(JSON.stringify(mockQuoteResponse), { status: 200 });
      }) as unknown as typeof fetch;

      await getQuote({
        inputMint: 'So11111111111111111111111111111111',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000000',
        slippageBps: 50,
        platformFeeBps: 25,
      });

      const parsed = new URL(capturedUrl);
      expect(parsed.searchParams.get('platformFeeBps')).toBe('25');
    });

    it('omits platformFeeBps when 0', async () => {
      let capturedUrl = '';
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        capturedUrl = typeof url === 'string' ? url : url.toString();
        return new Response(JSON.stringify(mockQuoteResponse), { status: 200 });
      }) as unknown as typeof fetch;

      await getQuote({
        inputMint: 'So11111111111111111111111111111111',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000000',
        slippageBps: 50,
        platformFeeBps: 0,
      });

      const parsed = new URL(capturedUrl);
      expect(parsed.searchParams.has('platformFeeBps')).toBe(false);
    });

    it('omits platformFeeBps when undefined', async () => {
      let capturedUrl = '';
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        capturedUrl = typeof url === 'string' ? url : url.toString();
        return new Response(JSON.stringify(mockQuoteResponse), { status: 200 });
      }) as unknown as typeof fetch;

      await getQuote({
        inputMint: 'So11111111111111111111111111111111',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000000',
        slippageBps: 50,
      });

      const parsed = new URL(capturedUrl);
      expect(parsed.searchParams.has('platformFeeBps')).toBe(false);
    });

    it('retries on 429 with exponential backoff', async () => {
      let callCount = 0;
      globalThis.fetch = mock(async () => {
        callCount++;
        if (callCount <= 2) {
          return new Response('rate limited', { status: 429 });
        }
        return new Response(JSON.stringify(mockQuoteResponse), { status: 200 });
      }) as unknown as typeof fetch;

      const result = await getQuote({
        inputMint: 'So11111111111111111111111111111111',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000000',
        slippageBps: 50,
      });

      expect(callCount).toBe(3);
      expect(result.inputMint).toBe(mockQuoteResponse.inputMint);
    });

    it('throws on non-200/non-429 with error message from response body', async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ error: 'Invalid token mint' }), {
          status: 400,
          statusText: 'Bad Request',
        });
      }) as unknown as typeof fetch;

      await expect(
        getQuote({
          inputMint: 'invalid',
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: '1000000000',
          slippageBps: 50,
        }),
      ).rejects.toThrow('Jupiter quote failed: Invalid token mint');
    });
  });

  describe('getSwapTransaction', () => {
    it('sends correct POST body', async () => {
      let capturedBody: Record<string, unknown> = {};
      globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify(mockSwapResponse), { status: 200 });
      }) as unknown as typeof fetch;

      const quoteResponse = mockQuoteResponse as any;
      await getSwapTransaction({
        quoteResponse,
        userPublicKey: '11111111111111111111111111111112',
      });

      expect(capturedBody.quoteResponse).toEqual(quoteResponse);
      expect(capturedBody.userPublicKey).toBe('11111111111111111111111111111112');
      expect(capturedBody.dynamicComputeUnitLimit).toBe(true);
      expect(capturedBody.dynamicSlippage).toBe(true);
    });

    it('includes feeAccount in POST body when provided', async () => {
      let capturedBody: Record<string, unknown> = {};
      globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify(mockSwapResponse), { status: 200 });
      }) as unknown as typeof fetch;

      await getSwapTransaction({
        quoteResponse: mockQuoteResponse as any,
        userPublicKey: '11111111111111111111111111111112',
        feeAccount: 'FeeAccountPubkeyHere11111111111111',
      });

      expect(capturedBody.feeAccount).toBe('FeeAccountPubkeyHere11111111111111');
    });

    it('returns swapTransaction and lastValidBlockHeight', async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify(mockSwapResponse), { status: 200 });
      }) as unknown as typeof fetch;

      const result = await getSwapTransaction({
        quoteResponse: mockQuoteResponse as any,
        userPublicKey: '11111111111111111111111111111112',
      });

      expect(result.swapTransaction).toBe(mockSwapResponse.swapTransaction);
      expect(result.lastValidBlockHeight).toBe(mockSwapResponse.lastValidBlockHeight);
    });
  });

  describe('amountToSmallestUnit', () => {
    it('converts 1 SOL correctly (9 decimals)', () => {
      expect(amountToSmallestUnit(1, 9)).toBe('1000000000');
    });

    it('converts 1.5 USDC correctly (6 decimals)', () => {
      expect(amountToSmallestUnit(1.5, 6)).toBe('1500000');
    });

    it('converts 0.001 SOL correctly', () => {
      expect(amountToSmallestUnit(0.001, 9)).toBe('1000000');
    });

    it('converts whole numbers with 0 decimals', () => {
      expect(amountToSmallestUnit(42, 0)).toBe('42');
    });
  });

  describe('deriveFeeAta', () => {
    it('returns a valid public key string', () => {
      const feeAccount = Keypair.generate().publicKey.toBase58();
      const tokenMint = USDC_MINT;

      const ata = deriveFeeAta(feeAccount, tokenMint);

      // Should be a valid base58 string (Solana pubkeys are 32-44 chars)
      expect(typeof ata).toBe('string');
      expect(ata.length).toBeGreaterThan(30);
      expect(ata.length).toBeLessThanOrEqual(44);
    });

    it('returns different ATAs for different mints', () => {
      const feeAccount = Keypair.generate().publicKey.toBase58();

      const ataUsdc = deriveFeeAta(feeAccount, USDC_MINT);
      const ataSol = deriveFeeAta(feeAccount, NATIVE_MINT.toBase58());

      expect(ataUsdc).not.toBe(ataSol);
    });
  });
});
