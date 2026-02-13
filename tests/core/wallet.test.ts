import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp, rm } from 'fs/promises';
import { Keypair, Transaction, SystemProgram, PublicKey } from '@solana/web3.js';
import { writeTempKeypair } from '../helpers.js';

// Mock os.homedir so expandHome (used by loadWallet) resolves ~ to our temp dir.
let _fakeHome = '/tmp/placeholder';
mock.module('os', () => {
  const realOs = require('os');
  return {
    ...realOs,
    homedir: () => _fakeHome,
  };
});

import { loadWallet, KeypairSigner } from '../../src/core/wallet.js';

// Read the mock keypair fixture
const MOCK_KEYPAIR_PATH = join(import.meta.dir, '..', 'fixtures', 'mock-keypair.json');
const MOCK_KEYPAIR_BYTES: number[] = await Bun.file(MOCK_KEYPAIR_PATH).json();

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'clawdex-test-'));
  _fakeHome = tempDir;
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('loadWallet', () => {
  it('loads valid keypair JSON file', async () => {
    const kpPath = await writeTempKeypair(tempDir, MOCK_KEYPAIR_BYTES);
    const keypair = loadWallet(kpPath);
    expect(keypair).toBeInstanceOf(Keypair);
    const expected = Keypair.fromSecretKey(Uint8Array.from(MOCK_KEYPAIR_BYTES));
    expect(keypair.publicKey.toBase58()).toBe(expected.publicKey.toBase58());
  });

  it('expands ~ in path', async () => {
    const kpPath = join(tempDir, 'wallet.json');
    await Bun.write(kpPath, JSON.stringify(MOCK_KEYPAIR_BYTES));

    const keypair = loadWallet('~/wallet.json');
    expect(keypair).toBeInstanceOf(Keypair);
  });

  it('throws on missing file with clear error', () => {
    expect(() => loadWallet('/nonexistent/path/wallet.json')).toThrow('Wallet file not found');
  });

  it('throws on invalid JSON', async () => {
    const badPath = join(tempDir, 'bad.json');
    await Bun.write(badPath, 'this is not json {{{');
    expect(() => loadWallet(badPath)).toThrow('not valid JSON');
  });

  it('throws on invalid format (not a byte array)', async () => {
    const badPath = join(tempDir, 'bad-format.json');
    await Bun.write(badPath, JSON.stringify({ key: 'value' }));
    expect(() => loadWallet(badPath)).toThrow('expected an array of numbers');
  });

  it('throws on empty array', async () => {
    const badPath = join(tempDir, 'empty-array.json');
    await Bun.write(badPath, JSON.stringify([]));
    expect(() => loadWallet(badPath)).toThrow('expected an array of numbers');
  });

  it('throws on array with non-numbers', async () => {
    const badPath = join(tempDir, 'string-array.json');
    await Bun.write(badPath, JSON.stringify(['a', 'b', 'c']));
    expect(() => loadWallet(badPath)).toThrow('expected an array of numbers');
  });
});

describe('KeypairSigner', () => {
  it('has correct publicKey', () => {
    const keypair = Keypair.fromSecretKey(Uint8Array.from(MOCK_KEYPAIR_BYTES));
    const signer = new KeypairSigner(keypair);
    expect(signer.publicKey.toBase58()).toBe(keypair.publicKey.toBase58());
  });

  it('signTransaction signs a transaction', async () => {
    const keypair = Keypair.fromSecretKey(Uint8Array.from(MOCK_KEYPAIR_BYTES));
    const signer = new KeypairSigner(keypair);

    const tx = new Transaction();
    tx.add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey('11111111111111111111111111111111'),
        lamports: 1000,
      }),
    );
    tx.recentBlockhash = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';
    tx.feePayer = keypair.publicKey;

    const signed = await signer.signTransaction(tx);
    expect(signed).toBe(tx);
    expect(tx.signatures.length).toBeGreaterThan(0);
    expect(tx.signatures[0].signature).not.toBeNull();
  });
});
