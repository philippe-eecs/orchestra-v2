/**
 * Shell helpers for executor implementations.
 */

/**
 * Escape an argument for safe use in a POSIX shell command string.
 *
 * Wraps in single quotes and escapes embedded single quotes.
 */
export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

