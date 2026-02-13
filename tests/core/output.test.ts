import { describe, it, expect, spyOn, afterEach } from 'bun:test';
import {
  formatOutput,
  formatError,
  formatTable,
  printResult,
  printError,
} from '../../src/core/output.js';
import { OutputMode } from '../../src/types.js';

describe('formatOutput', () => {
  it('in Json mode returns valid JSON string', () => {
    const data = { foo: 'bar', num: 42 };
    const result = formatOutput(data, OutputMode.Json);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual(data);
  });

  it('in Human mode returns formatted string for object', () => {
    const data = { name: 'test', value: 123 };
    const result = formatOutput(data, OutputMode.Human);
    expect(result).toContain('name');
    expect(result).toContain('test');
    expect(result).toContain('value');
    expect(result).toContain('123');
  });

  it('in Human mode returns empty string for null', () => {
    expect(formatOutput(null, OutputMode.Human)).toBe('');
  });

  it('in Human mode stringifies primitives', () => {
    expect(formatOutput(42, OutputMode.Human)).toBe('42');
    expect(formatOutput('hello', OutputMode.Human)).toBe('hello');
  });

  it('in Json mode handles arrays', () => {
    const data = [1, 2, 3];
    const result = formatOutput(data, OutputMode.Json);
    expect(JSON.parse(result)).toEqual([1, 2, 3]);
  });
});

describe('formatError', () => {
  it('in Json mode returns {error, code} JSON', () => {
    const result = formatError('something went wrong', OutputMode.Json, 1);
    const parsed = JSON.parse(result);
    expect(parsed.error).toBe('something went wrong');
    expect(parsed.code).toBe(1);
  });

  it('in Json mode handles Error objects', () => {
    const err = new Error('test error');
    const result = formatError(err, OutputMode.Json, 2);
    const parsed = JSON.parse(result);
    expect(parsed.error).toBe('test error');
    expect(parsed.code).toBe(2);
  });

  it('in Human mode includes error message', () => {
    const result = formatError('bad input', OutputMode.Human, 1);
    expect(result).toContain('Error:');
    expect(result).toContain('bad input');
  });
});

describe('formatTable', () => {
  it('in Json mode returns JSON array', () => {
    const rows = [
      { name: 'SOL', mint: 'So11...' },
      { name: 'USDC', mint: 'EPjF...' },
    ];
    const result = formatTable(rows, OutputMode.Json);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual(rows);
  });

  it('in Human mode returns aligned columns', () => {
    const rows = [
      { name: 'SOL', price: '100' },
      { name: 'USDC', price: '1' },
    ];
    const result = formatTable(rows, OutputMode.Human);
    const lines = result.split('\n');
    // Header, separator, two data rows
    expect(lines.length).toBe(4);
    // Header contains column names
    expect(lines[0]).toContain('name');
    expect(lines[0]).toContain('price');
    // Separator is dashes
    expect(lines[1]).toMatch(/^[-\s]+$/);
    // Data rows contain values
    expect(lines[2]).toContain('SOL');
    expect(lines[2]).toContain('100');
    expect(lines[3]).toContain('USDC');
    expect(lines[3]).toContain('1');
  });

  it('in Human mode returns empty string for empty array', () => {
    expect(formatTable([], OutputMode.Human)).toBe('');
  });
});

describe('printResult', () => {
  it('writes to stdout via console.log', () => {
    const spy = spyOn(console, 'log').mockImplementation(() => {});
    printResult({ foo: 'bar' }, OutputMode.Json);
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0];
    expect(JSON.parse(output)).toEqual({ foo: 'bar' });
    spy.mockRestore();
  });
});

describe('printError', () => {
  it('writes to stderr via console.error', () => {
    const spy = spyOn(console, 'error').mockImplementation(() => {});
    printError('oops', OutputMode.Json, 1);
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.error).toBe('oops');
    expect(parsed.code).toBe(1);
    spy.mockRestore();
  });
});
