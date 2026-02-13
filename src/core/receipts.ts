import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { dirname } from 'path';
import type { Receipt } from '../types.js';
import { RECEIPTS_FILE } from '../constants.js';

/** Expand leading `~` to the user's home directory. */
const expandPath = (p: string): string =>
  p.startsWith('~') ? p.replace('~', homedir()) : p;

/** Get the resolved receipts file path from config or default. */
export function getReceiptsPath(config?: { receipts_dir?: string }): string {
  if (config?.receipts_dir) {
    const resolvedDir = expandPath(config.receipts_dir);
    return `${resolvedDir}/receipts.jsonl`;
  }
  return expandPath(RECEIPTS_FILE);
}

/**
 * Store a receipt by appending it as a single JSON line to the receipts file.
 * Creates the directory if it doesn't exist.
 */
export async function storeReceipt(
  receipt: Receipt,
  config?: { receipts_dir?: string },
): Promise<void> {
  const filePath = getReceiptsPath(config);
  const dir = dirname(filePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const line = JSON.stringify(receipt) + '\n';
  appendFileSync(filePath, line, 'utf-8');
}

/**
 * Look up a receipt by transaction signature.
 * Scans the receipts JSONL file line by line for a matching txSignature.
 * Returns the Receipt if found, or null if not found / file doesn't exist.
 */
export async function lookupReceipt(
  txSignature: string,
  config?: { receipts_dir?: string },
): Promise<Receipt | null> {
  const filePath = getReceiptsPath(config);

  if (!existsSync(filePath)) {
    return null;
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const receipt: Receipt = JSON.parse(trimmed);
      if (receipt.txSignature === txSignature) {
        return receipt;
      }
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  return null;
}
