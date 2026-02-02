import { resolve, sep } from 'node:path';

export type ResolveWithinProjectRootResult =
  | { ok: true; absolutePath: string }
  | { ok: false; reason: string };

export function resolveWithinProjectRoot(projectRoot: string, inputPath: string): ResolveWithinProjectRootResult {
  const root = resolve(projectRoot);
  const candidate = resolve(root, inputPath);

  if (candidate === root) return { ok: true, absolutePath: candidate };
  if (candidate.startsWith(root + sep)) return { ok: true, absolutePath: candidate };

  return { ok: false, reason: 'Path escapes project root' };
}

