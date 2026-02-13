import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { parse as parseToml, stringify as stringifyToml } from '@iarna/toml';
import type { JsonMap } from '@iarna/toml';
import { homedir } from 'os';
import { join } from 'path';
import type { ClawdexConfig, SafetyConfig } from '../types.js';
import { EXIT_CONFIG } from '../types.js';
import {
  CONFIG_DIR,
  CONFIG_FILE,
  RECEIPTS_DIR,
  DEFAULT_RPC,
  DEFAULT_FEE_BPS,
} from '../constants.js';

/** Expand leading `~` to the user's home directory. */
export function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return join(homedir(), p.slice(1));
  }
  return p;
}

/** Return a ClawdexConfig populated entirely with default values. */
export function getDefaultConfig(): ClawdexConfig {
  return {
    rpc: DEFAULT_RPC,
    wallet: '',
    fee_bps: DEFAULT_FEE_BPS,
    fee_account: '',
    receipts_dir: RECEIPTS_DIR,
    safety: {},
  };
}

/** Load config from ~/.clawdex/config.toml, merging with defaults. */
export function loadConfig(): ClawdexConfig {
  const defaults = getDefaultConfig();
  const filePath = expandHome(CONFIG_FILE);

  if (!existsSync(filePath)) {
    return defaults;
  }

  const raw = readFileSync(filePath, 'utf-8');
  const parsed = parseToml(raw) as Record<string, unknown>;

  const safety: SafetyConfig = {};
  const rawSafety = parsed.safety as Record<string, unknown> | undefined;
  if (rawSafety && typeof rawSafety === 'object') {
    if (typeof rawSafety.max_fee_bps === 'number') safety.max_fee_bps = rawSafety.max_fee_bps;
    if (typeof rawSafety.max_slippage_bps === 'number') safety.max_slippage_bps = rawSafety.max_slippage_bps;
    if (typeof rawSafety.max_price_impact_bps === 'number') safety.max_price_impact_bps = rawSafety.max_price_impact_bps;
    if (typeof rawSafety.max_trade_sol === 'number') safety.max_trade_sol = rawSafety.max_trade_sol;
    if (Array.isArray(rawSafety.allowlist)) safety.allowlist = rawSafety.allowlist.map(String);
    if (Array.isArray(rawSafety.rpc_allowlist)) safety.rpc_allowlist = rawSafety.rpc_allowlist.map(String);
  }

  return {
    rpc: typeof parsed.rpc === 'string' ? parsed.rpc : defaults.rpc,
    wallet: typeof parsed.wallet === 'string' ? parsed.wallet : defaults.wallet,
    fee_bps: typeof parsed.fee_bps === 'number' ? parsed.fee_bps : defaults.fee_bps,
    fee_account: typeof parsed.fee_account === 'string' ? parsed.fee_account : defaults.fee_account,
    receipts_dir: typeof parsed.receipts_dir === 'string' ? parsed.receipts_dir : defaults.receipts_dir,
    safety,
  };
}

/**
 * Resolve final config by layering: defaults < config file < env vars < CLI flags.
 * Throws an error if the resolved RPC URL is not in the safety rpc_allowlist
 * (when the list is non-empty).
 */
export function resolveConfig(flags: Partial<ClawdexConfig> = {}): ClawdexConfig {
  const config = loadConfig();

  // Layer environment variables
  if (process.env.CLAWDEX_RPC) config.rpc = process.env.CLAWDEX_RPC;
  if (process.env.CLAWDEX_WALLET) config.wallet = process.env.CLAWDEX_WALLET;
  if (process.env.CLAWDEX_FEE_BPS) config.fee_bps = Number(process.env.CLAWDEX_FEE_BPS);
  if (process.env.CLAWDEX_FEE_ACCOUNT) config.fee_account = process.env.CLAWDEX_FEE_ACCOUNT;
  if (process.env.CLAWDEX_RECEIPTS_DIR) config.receipts_dir = process.env.CLAWDEX_RECEIPTS_DIR;

  // Layer CLI flags (override everything)
  if (flags.rpc != null) config.rpc = flags.rpc;
  if (flags.wallet != null) config.wallet = flags.wallet;
  if (flags.fee_bps != null) config.fee_bps = flags.fee_bps;
  if (flags.fee_account != null) config.fee_account = flags.fee_account;
  if (flags.receipts_dir != null) config.receipts_dir = flags.receipts_dir;
  if (flags.safety) config.safety = { ...config.safety, ...flags.safety };

  // Enforce rpc_allowlist
  if (config.safety.rpc_allowlist && config.safety.rpc_allowlist.length > 0) {
    if (!config.safety.rpc_allowlist.includes(config.rpc)) {
      const err = new Error(
        `RPC URL "${config.rpc}" is not in the allowed list: ${config.safety.rpc_allowlist.join(', ')}`,
      );
      (err as NodeJS.ErrnoException).code = String(EXIT_CONFIG);
      throw err;
    }
  }

  return config;
}

/** Ensure the config directory exists. */
function ensureConfigDir(): void {
  const dir = expandHome(CONFIG_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** Read the existing TOML config or return an empty map. */
function readOrCreateToml(): JsonMap {
  const filePath = expandHome(CONFIG_FILE);
  if (existsSync(filePath)) {
    return parseToml(readFileSync(filePath, 'utf-8'));
  }
  return {};
}

/**
 * Set a top-level config value. Read-modify-write the TOML file.
 * Creates the config directory and file if they don't exist.
 */
export function setConfigValue(key: string, value: string): void {
  const validKeys = ['rpc', 'wallet', 'fee_bps', 'fee_account', 'receipts_dir'];
  if (!validKeys.includes(key)) {
    throw new Error(`Unknown config key: "${key}". Valid keys: ${validKeys.join(', ')}`);
  }

  if (key === 'fee_bps') {
    const num = Number(value);
    if (isNaN(num) || num < 0) {
      throw new Error(`fee_bps must be a non-negative number, got "${value}"`);
    }
  }

  ensureConfigDir();
  const parsed = readOrCreateToml();

  if (key === 'fee_bps') {
    parsed[key] = Number(value);
  } else {
    parsed[key] = value;
  }

  writeFileSync(expandHome(CONFIG_FILE), stringifyToml(parsed), 'utf-8');
}

/**
 * Set a safety config value. Read-modify-write the [safety] section.
 * Creates the config directory and file if they don't exist.
 */
export function setSafetyValue(key: string, value: string): void {
  const numericKeys = ['max_fee_bps', 'max_slippage_bps', 'max_price_impact_bps', 'max_trade_sol'];
  const listKeys = ['allowlist', 'rpc_allowlist'];
  const validKeys = [...numericKeys, ...listKeys];

  if (!validKeys.includes(key)) {
    throw new Error(`Unknown safety key: "${key}". Valid keys: ${validKeys.join(', ')}`);
  }

  ensureConfigDir();
  const parsed = readOrCreateToml();

  if (!parsed.safety || typeof parsed.safety !== 'object') {
    parsed.safety = {} as JsonMap;
  }
  const safety = parsed.safety as JsonMap;

  if (numericKeys.includes(key)) {
    const num = Number(value);
    if (isNaN(num)) {
      throw new Error(`${key} must be a number, got "${value}"`);
    }
    safety[key] = num;
  } else {
    // List keys: parse comma-separated string into array
    safety[key] = value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  }

  writeFileSync(expandHome(CONFIG_FILE), stringifyToml(parsed), 'utf-8');
}
