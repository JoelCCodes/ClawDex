import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp, rm } from 'fs/promises';
import { readFileSync, statSync, existsSync } from 'fs';
import { writeFileAtomic } from '../../src/core/fs.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'agentdex-fs-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
  it('writes file with correct content', () => {
    const filePath = join(tempDir, 'test.txt');
    writeFileAtomic(filePath, 'hello world');
    expect(readFileSync(filePath, 'utf-8')).toBe('hello world');
  });

  it('replaces existing file content', () => {
    const filePath = join(tempDir, 'test.txt');
    writeFileAtomic(filePath, 'original');
    expect(readFileSync(filePath, 'utf-8')).toBe('original');

    writeFileAtomic(filePath, 'replaced');
    expect(readFileSync(filePath, 'utf-8')).toBe('replaced');
  });

  it('creates parent directories if needed', () => {
    const filePath = join(tempDir, 'sub', 'dir', 'test.txt');
    writeFileAtomic(filePath, 'nested');
    expect(readFileSync(filePath, 'utf-8')).toBe('nested');
  });

  it('sets file permissions when mode is specified', () => {
    const filePath = join(tempDir, 'secret.json');
    writeFileAtomic(filePath, '{"key": "value"}', { mode: 0o600 });

    const stats = statSync(filePath);
    // Check that the file mode has owner read/write only (0o600)
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('does not leave temp files on success', () => {
    const filePath = join(tempDir, 'clean.txt');
    writeFileAtomic(filePath, 'content');

    const files = require('fs').readdirSync(tempDir);
    expect(files).toEqual(['clean.txt']);
  });
});
