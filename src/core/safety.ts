import type { QuoteResult, SafetyConfig, SafetyValidationResult } from '../types.js';
import { SOL_MINT, KNOWN_TOKENS } from '../constants.js';

/** Validate a quote against the safety configuration. Returns all violations. */
export function validateSafety(
  quote: QuoteResult,
  safetyConfig: SafetyConfig,
): SafetyValidationResult {
  const violations: string[] = [];

  // Check platform fee
  if (
    safetyConfig.max_fee_bps != null &&
    quote.platformFee &&
    quote.platformFee.feeBps > safetyConfig.max_fee_bps
  ) {
    violations.push(
      `Platform fee ${quote.platformFee.feeBps} bps exceeds maximum ${safetyConfig.max_fee_bps} bps`,
    );
  }

  // Check slippage
  if (
    safetyConfig.max_slippage_bps != null &&
    quote.slippageBps > safetyConfig.max_slippage_bps
  ) {
    violations.push(
      `Slippage ${quote.slippageBps} bps exceeds maximum ${safetyConfig.max_slippage_bps} bps`,
    );
  }

  // Check price impact
  if (safetyConfig.max_price_impact_bps != null) {
    const impactBps = parseFloat(quote.priceImpactPct) * 100;
    if (impactBps > safetyConfig.max_price_impact_bps) {
      violations.push(
        `Price impact ${impactBps} bps exceeds maximum ${safetyConfig.max_price_impact_bps} bps`,
      );
    }
  }

  // Check trade size in SOL
  if (safetyConfig.max_trade_sol != null && quote.inputMint === SOL_MINT) {
    const solAmount = Number(quote.inAmount) / 1e9;
    if (solAmount > safetyConfig.max_trade_sol) {
      violations.push(
        `Trade size ${solAmount} SOL exceeds maximum ${safetyConfig.max_trade_sol} SOL`,
      );
    }
  }

  // Check allowlist (supports both symbols via KNOWN_TOKENS and raw mint addresses)
  if (safetyConfig.allowlist && safetyConfig.allowlist.length > 0) {
    const allowedMints = new Set<string>();
    for (const entry of safetyConfig.allowlist) {
      const known = KNOWN_TOKENS[entry.toUpperCase()];
      if (known) {
        allowedMints.add(known.mint);
      } else {
        allowedMints.add(entry);
      }
    }

    if (!allowedMints.has(quote.outputMint)) {
      violations.push(
        `Output token ${quote.outputMint} is not in the allowlist`,
      );
    }
  }

  return { safe: violations.length === 0, violations };
}
