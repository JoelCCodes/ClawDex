import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import type { QuoteResult } from '../types.js';
import {
  JUPITER_QUOTE_URL,
  JUPITER_SWAP_URL,
  MAX_RETRIES,
  INITIAL_RETRY_DELAY_MS,
} from '../constants.js';

/** Fetch with retry on 429 (rate limit) using exponential backoff. */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries: number = MAX_RETRIES,
): Promise<Response> {
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, options);

    if (res.status !== 429) {
      return res;
    }

    lastResponse = res;

    if (attempt < retries) {
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return lastResponse!;
}

/** Build headers with optional API key. */
function buildHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  return headers;
}

/** Get a swap quote from Jupiter. */
export async function getQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
  platformFeeBps?: number;
  apiKey?: string;
}): Promise<QuoteResult> {
  const url = new URL(JUPITER_QUOTE_URL);
  url.searchParams.set('inputMint', params.inputMint);
  url.searchParams.set('outputMint', params.outputMint);
  url.searchParams.set('amount', params.amount);
  url.searchParams.set('slippageBps', String(params.slippageBps));

  if (params.platformFeeBps != null && params.platformFeeBps > 0) {
    url.searchParams.set('platformFeeBps', String(params.platformFeeBps));
  }

  const res = await fetchWithRetry(url.toString(), { headers: buildHeaders(params.apiKey) });

  if (!res.ok) {
    let message = `Jupiter quote failed (${res.status}): ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.error) message = `Jupiter quote failed: ${body.error}`;
    } catch {
      // use default message
    }
    throw new Error(message);
  }

  return (await res.json()) as QuoteResult;
}

/** Build a swap transaction from a quote response via Jupiter. */
export async function getSwapTransaction(params: {
  quoteResponse: QuoteResult;
  userPublicKey: string;
  feeAccount?: string;
  apiKey?: string;
}): Promise<{ swapTransaction: string; lastValidBlockHeight: number }> {
  const body: Record<string, unknown> = {
    quoteResponse: params.quoteResponse,
    userPublicKey: params.userPublicKey,
    dynamicComputeUnitLimit: true,
    dynamicSlippage: true,
  };

  if (params.feeAccount) {
    body.feeAccount = params.feeAccount;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...buildHeaders(params.apiKey),
  };

  const res = await fetchWithRetry(JUPITER_SWAP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Jupiter swap failed (${res.status}): ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody.error) message = `Jupiter swap failed: ${errorBody.error}`;
    } catch {
      // use default message
    }
    throw new Error(message);
  }

  const data = (await res.json()) as {
    swapTransaction: string;
    lastValidBlockHeight: number;
  };

  return {
    swapTransaction: data.swapTransaction,
    lastValidBlockHeight: data.lastValidBlockHeight,
  };
}

/** Derive the Associated Token Account for a fee wallet and token mint. */
export function deriveFeeAta(
  feeAccountPubkey: string,
  tokenMint: string,
): string {
  const ata = getAssociatedTokenAddressSync(
    new PublicKey(tokenMint),
    new PublicKey(feeAccountPubkey),
  );
  return ata.toBase58();
}

/** Convert a human-readable amount to the smallest unit string. */
export function amountToSmallestUnit(amount: number, decimals: number): string {
  const factor = 10 ** decimals;
  const smallest = Math.round(amount * factor);
  return smallest.toString();
}
