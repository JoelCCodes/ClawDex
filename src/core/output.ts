import chalk from 'chalk';
import { OutputMode } from '../types.js';

/** Format data for display */
export function formatOutput(data: unknown, mode: OutputMode): string {
  if (mode === OutputMode.Json) {
    return JSON.stringify(data, null, 2);
  }

  // Human mode
  if (data === null || data === undefined) {
    return '';
  }

  if (typeof data !== 'object') {
    return String(data);
  }

  if (Array.isArray(data)) {
    return data.map((item) => formatOutput(item, mode)).join('\n');
  }

  // Format object as key-value pairs
  const entries = Object.entries(data as Record<string, unknown>);
  return entries
    .map(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        return `${chalk.bold(key)}:\n${formatOutput(value, mode)
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n')}`;
      }
      return `${chalk.bold(key)}: ${chalk.cyan(String(value))}`;
    })
    .join('\n');
}

/** Format an error for display */
export function formatError(error: string | Error, mode: OutputMode, exitCode: number): string {
  const message = error instanceof Error ? error.message : error;

  if (mode === OutputMode.Json) {
    return JSON.stringify({ error: message, code: exitCode });
  }

  return `${chalk.red('Error:')} ${message}`;
}

/** Write formatted output to stdout */
export function printResult(data: unknown, mode: OutputMode): void {
  console.log(formatOutput(data, mode));
}

/** Write formatted error to stderr */
export function printError(error: string | Error, mode: OutputMode, exitCode: number): void {
  console.error(formatError(error, mode, exitCode));
}

/** Format an array of objects as a table */
export function formatTable(rows: Record<string, unknown>[], mode: OutputMode): string {
  if (mode === OutputMode.Json) {
    return JSON.stringify(rows, null, 2);
  }

  if (rows.length === 0) {
    return '';
  }

  // Collect all column keys
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  // Calculate column widths
  const widths = columns.map((col) =>
    Math.max(col.length, ...rows.map((row) => String(row[col] ?? '').length))
  );

  // Header row
  const header = columns.map((col, i) => chalk.bold(col.padEnd(widths[i]))).join('  ');
  const separator = widths.map((w) => '-'.repeat(w)).join('  ');

  // Data rows
  const dataRows = rows.map((row) =>
    columns.map((col, i) => String(row[col] ?? '').padEnd(widths[i])).join('  ')
  );

  return [header, separator, ...dataRows].join('\n');
}
