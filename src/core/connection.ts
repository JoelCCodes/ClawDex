import { Connection } from '@solana/web3.js';

/**
 * Create a Solana RPC connection.
 * Extracted to enable test mocking without replacing @solana/web3.js globally.
 */
export function createConnection(rpcUrl: string, commitment: string = 'confirmed'): Connection {
  return new Connection(rpcUrl, commitment as any);
}
