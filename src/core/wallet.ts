import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { Keypair, Transaction, PublicKey } from '@solana/web3.js';
import type { Signer } from '../types.js';
import { expandHome } from './config.js';

/**
 * Load a Solana keypair from a JSON file.
 * The file should contain an array of bytes (standard Solana keypair format).
 */
export function loadWallet(walletPath: string): Keypair {
  const resolved = expandHome(walletPath);

  if (!existsSync(resolved)) {
    throw new Error(`Wallet file not found: ${resolved}`);
  }

  let raw: string;
  try {
    raw = readFileSync(resolved, 'utf-8');
  } catch {
    throw new Error(`Failed to read wallet file: ${resolved}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Wallet file is not valid JSON: ${resolved}`);
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    !parsed.every((n) => typeof n === 'number')
  ) {
    throw new Error(
      `Invalid keypair format in ${resolved}: expected an array of numbers (byte array)`,
    );
  }

  try {
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch (e) {
    throw new Error(
      `Failed to create keypair from ${resolved}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Generate a new Solana keypair and save it to a JSON file.
 * Refuses to overwrite an existing file. Writes with 0o600 permissions (owner-only).
 */
export function generateWallet(outputPath: string): Keypair {
  const resolved = expandHome(outputPath);
  const dir = dirname(resolved);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (existsSync(resolved)) {
    throw new Error(`Wallet file already exists: ${resolved}. Will not overwrite.`);
  }
  const keypair = Keypair.generate();
  writeFileSync(resolved, JSON.stringify(Array.from(keypair.secretKey)), { mode: 0o600 });
  return keypair;
}

/**
 * Keypair-based signer implementing the Signer interface.
 * Wraps a Solana Keypair for transaction signing.
 */
export class KeypairSigner implements Signer {
  public readonly publicKey: PublicKey;
  private readonly keypair: Keypair;

  constructor(keypair: Keypair) {
    this.keypair = keypair;
    this.publicKey = keypair.publicKey;
  }

  async signTransaction(tx: Transaction): Promise<Transaction> {
    tx.partialSign(this.keypair);
    return tx;
  }
}
