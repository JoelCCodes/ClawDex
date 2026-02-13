import { PublicKey } from '@solana/web3.js';

// Jupiter API
export const JUPITER_QUOTE_URL = 'https://api.jup.ag/swap/v1/quote';
export const JUPITER_SWAP_URL = 'https://api.jup.ag/swap/v1/swap';
export const JUPITER_TOKEN_LIST_URL = 'https://tokens.jup.ag/tokens?tags=verified';

// Known program IDs
export const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ATA_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const JUPITER_V6_PROGRAM_ID = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');

// Known token mints
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

// Hardcoded token info
export const KNOWN_TOKENS: Record<string, { symbol: string; name: string; mint: string; decimals: number }> = {
  SOL: { symbol: 'SOL', name: 'Solana', mint: SOL_MINT, decimals: 9 },
  USDC: { symbol: 'USDC', name: 'USD Coin', mint: USDC_MINT, decimals: 6 },
  USDT: { symbol: 'USDT', name: 'Tether USD', mint: USDT_MINT, decimals: 6 },
};

// Common fee token mints (top tokens by Jupiter volume)
export const COMMON_FEE_MINTS: { symbol: string; mint: string }[] = [
  { symbol: 'USDC', mint: USDC_MINT },
  { symbol: 'USDT', mint: USDT_MINT },
  { symbol: 'SOL', mint: SOL_MINT },
  { symbol: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
  { symbol: 'jitoSOL', mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn' },
  { symbol: 'mSOL', mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So' },
  { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
  { symbol: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
  { symbol: 'RAY', mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R' },
  { symbol: 'PYTH', mint: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3' },
];

// Config paths
export const CONFIG_DIR = '~/.clawdex';
export const CONFIG_FILE = '~/.clawdex/config.toml';
export const TOKEN_CACHE_FILE = '~/.clawdex/token-cache.json';
export const RECEIPTS_DIR = '~/.clawdex/receipts';
export const RECEIPTS_FILE = '~/.clawdex/receipts/receipts.jsonl';

// Defaults
export const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';
export const DEFAULT_SLIPPAGE_BPS = 50;
export const DEFAULT_FEE_BPS = 20;
export const DEFAULT_FEE_ACCOUNT = '76JTogdqp98XRkBXMdEz77P36Gq4LjikRdqzqKGqHKK8';
export const TOKEN_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Retry config
export const MAX_RETRIES = 3;
export const INITIAL_RETRY_DELAY_MS = 1000;
