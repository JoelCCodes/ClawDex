import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import type { TransferDiff, TokenChange, TransferValidationResult } from '../types.js';
import { EXIT_SIMULATION } from '../types.js';
import {
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ATA_PROGRAM_ID,
  JUPITER_V6_PROGRAM_ID,
} from '../constants.js';

const debug = (...args: unknown[]) => {
  if (process.env.DEBUG?.includes('clawdex')) {
    console.error('[clawdex:simulate]', ...args);
  }
};

/**
 * Simulate a transaction and compute a TransferDiff describing its net effects.
 *
 * Handles both legacy Transaction and VersionedTransaction.
 * The simulation is used for error detection and balance change estimation.
 */
export async function simulateAndDiff(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  userPublicKey: PublicKey,
): Promise<TransferDiff> {
  debug('Simulating transaction for', userPublicKey.toBase58());

  let simValue: {
    err: unknown;
    logs: string[] | null;
    unitsConsumed?: number;
  };

  if (transaction instanceof VersionedTransaction) {
    const res = await connection.simulateTransaction(transaction, {
      sigVerify: false,
      replaceRecentBlockhash: true,
    });
    simValue = res.value;
  } else {
    const res = await connection.simulateTransaction(transaction);
    simValue = res.value;
  }

  if (simValue.err) {
    const errMsg =
      typeof simValue.err === 'string'
        ? simValue.err
        : JSON.stringify(simValue.err);
    const logs = simValue.logs?.join('\n') ?? 'No logs available';
    const error = new Error(
      `Transaction simulation failed: ${errMsg}\nLogs:\n${logs}`,
    );
    (error as NodeJS.ErrnoException).code = String(EXIT_SIMULATION);
    throw error;
  }

  debug('Simulation succeeded, units consumed:', simValue.unitsConsumed);

  // --- Parse balance changes from simulation result ---
  let solChange = 0;
  const tokenChanges: TokenChange[] = [];
  const destinations = new Set<string>();

  // Pre/post SOL balances (available in simulation result for legacy txs)
  const simPre = (simValue as Record<string, unknown>).preBalances as number[] | undefined;
  const simPost = (simValue as Record<string, unknown>).postBalances as number[] | undefined;
  if (simPre && simPost && simPre.length > 0) {
    solChange = simPost[0] - simPre[0]; // in lamports
  }

  // Pre/post token balances
  const preTokenBalances = (simValue as Record<string, unknown>).preTokenBalances as Array<{
    accountIndex: number;
    mint: string;
    owner?: string;
    uiTokenAmount?: { amount?: string; decimals?: number };
  }> | undefined;
  const postTokenBalances = (simValue as Record<string, unknown>).postTokenBalances as Array<{
    accountIndex: number;
    mint: string;
    owner?: string;
    uiTokenAmount?: { amount?: string; decimals?: number };
  }> | undefined;

  if (preTokenBalances && postTokenBalances) {
    const preMap = new Map<string, { amount: number; decimals: number; owner: string; mint: string }>();
    for (const tb of preTokenBalances) {
      const key = `${tb.accountIndex}:${tb.mint}`;
      preMap.set(key, {
        amount: Number(tb.uiTokenAmount?.amount ?? '0'),
        decimals: tb.uiTokenAmount?.decimals ?? 0,
        owner: tb.owner ?? '',
        mint: tb.mint,
      });
    }

    const seenKeys = new Set<string>();
    for (const tb of postTokenBalances) {
      const key = `${tb.accountIndex}:${tb.mint}`;
      seenKeys.add(key);
      const pre = preMap.get(key);
      const preAmount = pre?.amount ?? 0;
      const postAmount = Number(tb.uiTokenAmount?.amount ?? '0');
      const change = postAmount - preAmount;
      const decimals = tb.uiTokenAmount?.decimals ?? 0;

      if (change !== 0) {
        tokenChanges.push({ mint: tb.mint, change, decimals });
      }

      // Track destination addresses for incoming transfers
      const owner = tb.owner ?? '';
      if (change > 0 && owner) {
        destinations.add(owner);
      }
    }

    // Check for accounts fully drained (present in pre but not post)
    for (const [key, pre] of preMap) {
      if (!seenKeys.has(key) && pre.amount > 0) {
        tokenChanges.push({
          mint: pre.mint,
          change: -pre.amount,
          decimals: pre.decimals,
        });
      }
    }
  }

  // Also collect destinations from instruction data
  if (transaction instanceof Transaction) {
    for (const ix of transaction.instructions) {
      collectInstructionDestinations(ix, userPublicKey, destinations);
    }
  } else {
    collectVersionedDestinations(transaction, userPublicKey, destinations);
  }

  // Estimate fee: 5000 lamports base
  const feeAmount = 5000;

  return {
    solChange,
    tokenChanges,
    destinations: Array.from(destinations),
    feeAmount,
  };
}

/** Extract destinations from a legacy TransactionInstruction. */
function collectInstructionDestinations(
  ix: TransactionInstruction,
  userPublicKey: PublicKey,
  destinations: Set<string>,
): void {
  const userKey = userPublicKey.toBase58();
  for (const key of ix.keys) {
    const addr = key.pubkey.toBase58();
    if (addr !== userKey) {
      destinations.add(addr);
    }
  }
}

/** Extract destinations from a VersionedTransaction. */
function collectVersionedDestinations(
  transaction: VersionedTransaction,
  userPublicKey: PublicKey,
  destinations: Set<string>,
): void {
  const message = transaction.message;
  const accountKeys = message.staticAccountKeys.map((k) => k.toBase58());
  const userKey = userPublicKey.toBase58();

  for (const ix of message.compiledInstructions) {
    for (const idx of ix.accountKeyIndexes) {
      const addr = accountKeys[idx];
      if (addr && addr !== userKey) {
        destinations.add(addr);
      }
    }
  }
}

/**
 * Build a set of "known" addresses expected to participate in a swap.
 *
 * Includes the user's wallet, their ATAs, well-known program IDs,
 * and optionally the fee account and its ATAs.
 */
export function buildKnownAddresses(
  userPublicKey: PublicKey,
  feeAccount?: string,
  tokenMints?: string[],
): Set<string> {
  const known = new Set<string>();

  // User wallet
  known.add(userPublicKey.toBase58());

  // Well-known program IDs
  known.add(SYSTEM_PROGRAM_ID.toBase58());
  known.add(TOKEN_PROGRAM_ID.toBase58());
  known.add(ATA_PROGRAM_ID.toBase58());
  known.add(JUPITER_V6_PROGRAM_ID.toBase58());

  // User ATAs for each token mint
  if (tokenMints) {
    for (const mint of tokenMints) {
      try {
        const mintPubkey = new PublicKey(mint);
        const ata = getAssociatedTokenAddressSync(mintPubkey, userPublicKey);
        known.add(ata.toBase58());
      } catch {
        debug('Failed to derive ATA for mint', mint);
      }
    }
  }

  // Fee account and its ATAs
  if (feeAccount) {
    known.add(feeAccount);
    if (tokenMints) {
      try {
        const feePubkey = new PublicKey(feeAccount);
        for (const mint of tokenMints) {
          try {
            const mintPubkey = new PublicKey(mint);
            const feeAta = getAssociatedTokenAddressSync(mintPubkey, feePubkey);
            known.add(feeAta.toBase58());
          } catch {
            debug('Failed to derive fee ATA for mint', mint);
          }
        }
      } catch {
        debug('Invalid fee account public key', feeAccount);
      }
    }
  }

  return known;
}

/**
 * Validate that all transfer destinations are known addresses.
 * Fail-closed: reject if ANY destination is not in the known set.
 */
export function validateTransfers(
  diff: TransferDiff,
  knownAddresses: Set<string>,
): TransferValidationResult {
  const unknownAddresses: string[] = [];

  for (const dest of diff.destinations) {
    if (!knownAddresses.has(dest)) {
      unknownAddresses.push(dest);
    }
  }

  return {
    safe: unknownAddresses.length === 0,
    unknownAddresses,
  };
}

/**
 * Format a TransferDiff for human-readable display.
 */
export function formatTransferDiff(diff: TransferDiff): string {
  const lines: string[] = [];

  // SOL change (diff.solChange is in lamports)
  const solAmount = diff.solChange / 1e9;
  const solSign = solAmount >= 0 ? '+' : '';
  lines.push(`  SOL: ${solSign}${solAmount.toFixed(9)} SOL`);

  // Token changes (diff token change values are in raw units)
  for (const tc of diff.tokenChanges) {
    const amount = tc.change / 10 ** tc.decimals;
    const sign = amount >= 0 ? '+' : '';
    const label = tc.symbol ?? tc.mint.slice(0, 8) + '...';
    lines.push(`  ${label}: ${sign}${amount.toFixed(tc.decimals)}`);
  }

  // Network fee
  if (diff.feeAmount != null) {
    const feeSol = diff.feeAmount / 1e9;
    lines.push(`  Network fee: ${feeSol.toFixed(9)} SOL`);
  }

  // Destinations
  if (diff.destinations.length > 0) {
    lines.push(`  Destinations (${diff.destinations.length}):`);
    for (const dest of diff.destinations) {
      lines.push(`    ${dest}`);
    }
  }

  return lines.join('\n');
}
