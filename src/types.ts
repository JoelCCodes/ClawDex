// Output mode
export enum OutputMode {
  Human = 'human',
  Json = 'json',
}

// Exit codes
export const EXIT_SUCCESS = 0;
export const EXIT_GENERAL = 1;
export const EXIT_SAFETY = 2;
export const EXIT_SIMULATION = 3;
export const EXIT_SEND = 4;
export const EXIT_CONFIG = 5;

// Safety config
export interface SafetyConfig {
  max_fee_bps?: number;
  max_slippage_bps?: number;
  max_price_impact_bps?: number;
  max_trade_sol?: number;
  allowlist?: string[];
  rpc_allowlist?: string[];
}

// Main config
export interface ClawdexConfig {
  rpc: string;
  wallet: string;
  fee_bps: number;
  fee_account: string;
  receipts_dir: string;
  safety: SafetyConfig;
}

// Token info
export interface TokenInfo {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  logoURI?: string;
}

// Quote result (from Jupiter)
export interface QuoteResult {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
  priceImpactPct: string;
  routePlan: RoutePlanStep[];
  contextSlot?: number;
}

export interface RoutePlanStep {
  swapInfo: {
    ammKey: string;
    label?: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
}

// Transfer diff from simulation
export interface TransferDiff {
  solChange: number;
  tokenChanges: TokenChange[];
  destinations: string[];
  feeAmount?: number;
}

export interface TokenChange {
  mint: string;
  symbol?: string;
  change: number;
  decimals: number;
}

// Receipt
export interface Receipt {
  timestamp: string;
  txSignature: string;
  inputToken: TokenInfo;
  outputToken: TokenInfo;
  inputAmount: string;
  outputAmount: string;
  route: string;
  fees: {
    platformFeeBps?: number;
    platformFeeAmount?: string;
    networkFee?: number;
  };
  transferDiff?: TransferDiff;
  status: 'success' | 'failed' | 'simulated';
  error?: string;
}

// Signer interface
export interface Signer {
  publicKey: import('@solana/web3.js').PublicKey;
  signTransaction(tx: import('@solana/web3.js').Transaction): Promise<import('@solana/web3.js').Transaction>;
}

// Safety validation result
export interface SafetyValidationResult {
  safe: boolean;
  violations: string[];
}

// Transfer validation result
export interface TransferValidationResult {
  safe: boolean;
  unknownAddresses: string[];
}
