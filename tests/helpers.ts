import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'clawdex-test-'));
}

export async function cleanupTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

// Write a temp config file for testing
export async function writeTempConfig(dir: string, content: string): Promise<string> {
  const configPath = join(dir, 'config.toml');
  await Bun.write(configPath, content);
  return configPath;
}

// Write a temp keypair file for testing
export async function writeTempKeypair(dir: string, keypair: number[]): Promise<string> {
  const keypairPath = join(dir, 'keypair.json');
  await Bun.write(keypairPath, JSON.stringify(keypair));
  return keypairPath;
}
