import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveWithinProjectRoot } from '../lib/server/paths';
import { readTextPreview } from '../lib/server/file-preview';

test('resolveWithinProjectRoot allows in-root relative paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'orchestra-'));
  const file = resolve(root, 'a/b/c.txt');
  const result = resolveWithinProjectRoot(root, 'a/b/c.txt');
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.absolutePath, file);
});

test('resolveWithinProjectRoot blocks escaping root via ..', () => {
  const root = mkdtempSync(join(tmpdir(), 'orchestra-'));
  const result = resolveWithinProjectRoot(root, '../secrets.txt');
  assert.equal(result.ok, false);
});

test('resolveWithinProjectRoot blocks absolute paths outside root', () => {
  const root = mkdtempSync(join(tmpdir(), 'orchestra-'));
  const result = resolveWithinProjectRoot(root, '/etc/hosts');
  assert.equal(result.ok, false);
});

test('readTextPreview truncates by maxLines', async () => {
  const root = mkdtempSync(join(tmpdir(), 'orchestra-'));
  const filePath = join(root, 'many-lines.txt');
  writeFileSync(filePath, Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n'), 'utf8');

  const preview = await readTextPreview(filePath, { maxLines: 3, maxBytes: 1024 * 1024 });
  assert.equal(preview.truncated, true);
  assert.match(preview.content, /^line 1\nline 2\nline 3\n\.\.\.$/);
  assert.ok(preview.fileSizeBytes > 0);
});

