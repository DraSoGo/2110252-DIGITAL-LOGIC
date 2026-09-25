import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('content audit passes against the real repository', async () => {
  const { stdout, stderr } = await run(process.execPath, [path.join(root, 'scripts', 'check-project.mjs')]);
  assert.match(stdout, /Content audit passed/);
  assert.equal(stderr.includes('✗'), false);
});
