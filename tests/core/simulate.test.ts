import { describe, it, expect } from 'bun:test';
import { Keypair, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, NATIVE_MINT } from '@solana/spl-token';
import { buildKnownAddresses, validateTransfers } from '../../src/core/simulate.js';
import type { TransferDiff } from '../../src/types.js';
import {
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ATA_PROGRAM_ID,
  JUPITER_V6_PROGRAM_ID,
  USDC_MINT,
} from '../../src/constants.js';

// Use deterministic keypairs derived from fixed seeds for test reproducibility
const TEST_USER_PUBKEY = Keypair.generate().publicKey;
const TEST_FEE_KEYPAIR = Keypair.generate();
const TEST_FEE_ACCOUNT = TEST_FEE_KEYPAIR.publicKey.toBase58();

describe('simulate', () => {
  describe('buildKnownAddresses', () => {
    it('includes user wallet and system programs', () => {
      const known = buildKnownAddresses(TEST_USER_PUBKEY);

      expect(known.has(TEST_USER_PUBKEY.toBase58())).toBe(true);
      expect(known.has(SYSTEM_PROGRAM_ID.toBase58())).toBe(true);
      expect(known.has(TOKEN_PROGRAM_ID.toBase58())).toBe(true);
      expect(known.has(ATA_PROGRAM_ID.toBase58())).toBe(true);
      expect(known.has(JUPITER_V6_PROGRAM_ID.toBase58())).toBe(true);
    });

    it('includes user ATAs for provided token mints', () => {
      // Use NATIVE_MINT (valid pubkey) and USDC_MINT (valid pubkey) for ATA derivation
      const known = buildKnownAddresses(TEST_USER_PUBKEY, undefined, [NATIVE_MINT.toBase58(), USDC_MINT]);

      const solAta = getAssociatedTokenAddressSync(
        NATIVE_MINT,
        TEST_USER_PUBKEY,
      );
      const usdcAta = getAssociatedTokenAddressSync(
        new PublicKey(USDC_MINT),
        TEST_USER_PUBKEY,
      );

      expect(known.has(solAta.toBase58())).toBe(true);
      expect(known.has(usdcAta.toBase58())).toBe(true);
    });

    it('includes fee account and fee ATAs when provided', () => {
      const feePubkey = TEST_FEE_KEYPAIR.publicKey;
      const known = buildKnownAddresses(TEST_USER_PUBKEY, TEST_FEE_ACCOUNT, [USDC_MINT]);

      expect(known.has(TEST_FEE_ACCOUNT)).toBe(true);

      const feeAta = getAssociatedTokenAddressSync(
        new PublicKey(USDC_MINT),
        feePubkey,
      );
      expect(known.has(feeAta.toBase58())).toBe(true);
    });

    it('does not include fee ATAs when no token mints provided', () => {
      const known = buildKnownAddresses(TEST_USER_PUBKEY, TEST_FEE_ACCOUNT);

      // Fee account itself should be included
      expect(known.has(TEST_FEE_ACCOUNT)).toBe(true);
      // user + 4 programs (System, Token, ATA, Jupiter) + fee account = 6
      expect(known.size).toBe(6);
    });
  });

  describe('validateTransfers', () => {
    it('returns safe=true when all destinations are known', () => {
      const knownAddresses = new Set([
        'Address1111111111111111111111111111',
        'Address2222222222222222222222222222',
      ]);
      const diff: TransferDiff = {
        solChange: -1000000000,
        tokenChanges: [],
        destinations: ['Address1111111111111111111111111111', 'Address2222222222222222222222222222'],
        feeAmount: 5000,
      };

      const result = validateTransfers(diff, knownAddresses);
      expect(result.safe).toBe(true);
      expect(result.unknownAddresses).toHaveLength(0);
    });

    it('returns safe=false with unknown addresses listed', () => {
      const knownAddresses = new Set([
        'Address1111111111111111111111111111',
      ]);
      const diff: TransferDiff = {
        solChange: -1000000000,
        tokenChanges: [],
        destinations: ['Address1111111111111111111111111111', 'UnknownAddr11111111111111111111111'],
        feeAmount: 5000,
      };

      const result = validateTransfers(diff, knownAddresses);
      expect(result.safe).toBe(false);
      expect(result.unknownAddresses).toEqual(['UnknownAddr11111111111111111111111']);
    });

    it('always includes system programs as known via buildKnownAddresses', () => {
      const known = buildKnownAddresses(TEST_USER_PUBKEY);

      const diff: TransferDiff = {
        solChange: -5000,
        tokenChanges: [],
        destinations: [
          SYSTEM_PROGRAM_ID.toBase58(),
          TOKEN_PROGRAM_ID.toBase58(),
          ATA_PROGRAM_ID.toBase58(),
          JUPITER_V6_PROGRAM_ID.toBase58(),
        ],
        feeAmount: 5000,
      };

      const result = validateTransfers(diff, known);
      expect(result.safe).toBe(true);
      expect(result.unknownAddresses).toHaveLength(0);
    });

    it('returns safe=true for empty destinations', () => {
      const knownAddresses = new Set<string>();
      const diff: TransferDiff = {
        solChange: 0,
        tokenChanges: [],
        destinations: [],
        feeAmount: 5000,
      };

      const result = validateTransfers(diff, knownAddresses);
      expect(result.safe).toBe(true);
      expect(result.unknownAddresses).toHaveLength(0);
    });
  });
});
