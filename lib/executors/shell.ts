export function escapeShellArg(arg: string): string {
  // POSIX-safe single-quote escaping: ' -> '\''.
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

