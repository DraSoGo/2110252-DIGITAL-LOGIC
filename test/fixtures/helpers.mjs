// Helpers to build throwaway content trees for tests. Each test gets a fresh
// temp directory — real content/ is never touched by error-case tests.
import { mkdtemp, mkdir, writeFile, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

export async function makeRoot() {
  return mkdtemp(path.join(tmpdir(), 'diglo-test-'));
}

export async function cleanup(root) {
  await rm(root, { recursive: true, force: true });
}

export async function group(root, relative, config) {
  const dir = path.join(root, 'content', relative);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'group.json'), JSON.stringify(config, null, 2));
  return dir;
}

export async function problem(root, relative, config, files = {}) {
  const dir = path.join(root, 'content', relative);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'metadata.json'), JSON.stringify(config, null, 2));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(dir, name), content);
  }
  return dir;
}

export const validGroup = (id, title, order) => ({ schemaVersion: 1, id, title, order });
export const validProblem = (id, title, order, { aliases = [], kind = 'lab' } = {}) => ({
  schemaVersion: 1, id, aliases, title, order, kind,
});

/** A minimal valid tree: 2 root groups, one nested group, 3 problems. */
export async function minimalTree(root) {
  await group(root, 'alpha', validGroup('alpha', 'Alpha', 1));
  await group(root, 'beta', validGroup('beta', 'Beta', 2));
  await group(root, 'beta/inner', validGroup('beta/inner', 'Inner', 1));
  await problem(root, 'alpha/one', validProblem('alpha/one', 'First', 1), {
    'statement.pdf': '%PDF-1.4', 'solution.dig': '<circuit/>',
  });
  await problem(root, 'alpha/two', validProblem('alpha/two', 'Second', 2, { aliases: ['Legacy/Two'] }), {
    'solution.dig': '<circuit/>',
  });
  await problem(root, 'beta/inner/three', validProblem('beta/inner/three', 'Third', 1), {
    'statement.pdf': '%PDF-1.4', 'note.ods': 'ods-bytes',
  });
}
