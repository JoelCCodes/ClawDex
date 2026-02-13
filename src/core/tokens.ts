import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import type { TokenInfo } from '../types.js';
import {
  KNOWN_TOKENS,
  JUPITER_TOKEN_LIST_URL,
  TOKEN_CACHE_FILE,
  CONFIG_DIR,
  TOKEN_CACHE_TTL_MS,
} from '../constants.js';

/** Expand ~ to home directory */
const expandHome = (p: string): string =>
  p.startsWith('~') ? p.replace('~', homedir()) : p;

/** Base58 character set (no 0, O, I, l) */
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

/** Check if a string looks like a valid Solana base58 address */
export function isValidBase58(str: string): boolean {
  return str.length >= 32 && str.length <= 44 && BASE58_RE.test(str);
}

/** Cached token list structure on disk */
interface TokenCache {
  timestamp: number;
  tokens: TokenInfo[];
}

/** Fetch the verified token list from Jupiter, with file-based caching */
export async function fetchTokenList(apiKey?: string): Promise<TokenInfo[]> {
  const cachePath = expandHome(TOKEN_CACHE_FILE);

  // Try reading from cache
  if (existsSync(cachePath)) {
    try {
      const raw = readFileSync(cachePath, 'utf-8');
      const cache: TokenCache = JSON.parse(raw);
      if (Date.now() - cache.timestamp < TOKEN_CACHE_TTL_MS) {
        return cache.tokens;
      }
    } catch {
      // Cache corrupted or unreadable — re-fetch
    }
  }

  // Fetch from Jupiter
  const headers: Record<string, string> = {};
  if (apiKey) headers['x-api-key'] = apiKey;
  const res = await fetch(JUPITER_TOKEN_LIST_URL, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch token list: ${res.status} ${res.statusText}`);
  }

  const data: Array<{
    id: string;
    symbol: string;
    name: string;
    decimals: number;
    icon?: string;
  }> = await res.json();

  const tokens: TokenInfo[] = data.map((t) => ({
    mint: t.id,
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    logoURI: t.icon,
  }));

  // Write cache
  const dir = expandHome(CONFIG_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const cache: TokenCache = { timestamp: Date.now(), tokens };
  writeFileSync(cachePath, JSON.stringify(cache), 'utf-8');

  return tokens;
}

/** Resolve a token symbol or mint address to full TokenInfo */
export async function resolveToken(symbolOrMint: string, apiKey?: string): Promise<TokenInfo> {
  // Check known tokens (case-insensitive symbol match)
  const upper = symbolOrMint.toUpperCase();
  const known = KNOWN_TOKENS[upper];
  if (known) {
    return { ...known };
  }

  // Check known tokens by mint address
  const knownByMint = Object.values(KNOWN_TOKENS).find((t) => t.mint === symbolOrMint);
  if (knownByMint) {
    return { ...knownByMint };
  }

  // If it looks like a mint address, search the Jupiter token list
  if (isValidBase58(symbolOrMint)) {
    const tokens = await fetchTokenList(apiKey);
    const found = tokens.find((t) => t.mint === symbolOrMint);
    if (found) {
      return { ...found };
    }
  }

  throw new Error(`Token not found: ${symbolOrMint}`);
}
