import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeShellArg } from '../lib/executors/shell';

test('escapeShellArg wraps argument in single quotes', () => {
  assert.equal(escapeShellArg('hello world'), "'hello world'");
});

test('escapeShellArg escapes embedded single quotes', () => {
  assert.equal(escapeShellArg("a'b"), "'a'\\''b'");
});

