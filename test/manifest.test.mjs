import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import {
  scanContent,
  readJsonFile,
  validateGroupConfig,
  validateProblemConfig,
  detectCanonicalResources,
  validateSiblingOrders,
  buildProblemRecord,
  ContentError,
} from '../scripts/lib/manifest.mjs';
import { makeRoot, cleanup, group, problem, validGroup, validProblem, minimalTree } from './fixtures/helpers.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test.afterEach?.(async () => {}); // placeholder for symmetry; each test cleans its own root

async function withRoot(run) {
  const root = await makeRoot();
  try {
    return await run(root);
  } finally {
    await cleanup(root);
  }
}

async function scanOk(root) {
  const { problems } = await scanContent(root);
  return problems;
}

async function assertScanFails(root, messagePart) {
  await assert.rejects(() => scanContent(root), (error) => {
    assert.ok(error instanceof ContentError, `expected ContentError, got ${error.constructor.name}`);
    if (messagePart) assert.match(error.message, new RegExp(messagePart), `error message should mention "${messagePart}", got: ${error.message}`);
    return true;
  });
}

/* ---------- Happy paths ---------- */

test('scanner reads nested groups at multiple levels', async () => {
  await withRoot(async (root) => {
    await minimalTree(root);
    const problems = await scanOk(root);
    assert.equal(problems.length, 3);
    const nested = problems.find((p) => p.id === 'beta/inner/three');
    assert.deepEqual(nested.groupPath, ['Beta', 'Inner']);
  });
});

test('group titles and order come from group.json, not folder names', async () => {
  await withRoot(async (root) => {
    await group(root, 'zzz-folder', { schemaVersion: 1, id: 'zzz-folder', title: 'Displayed Title', order: 7 });
    await problem(root, 'zzz-folder/item', validProblem('zzz-folder/item', 'Item', 1), { 'statement.pdf': 'x' });
    const problems = await scanOk(root);
    assert.equal(problems[0].groupPath[0], 'Displayed Title');
  });
});

test('problem id, title, order and kind come from metadata.json, not folder names', async () => {
  await withRoot(async (root) => {
    await group(root, 'g', validGroup('g', 'G', 1));
    await problem(root, 'g/weird-folder-name', {
      schemaVersion: 1, id: 'custom-id', aliases: [], title: 'Custom Title', order: 42, kind: 'exam',
    }, { 'statement.pdf': 'x' });
    const problems = await scanOk(root);
    assert.equal(problems[0].id, 'custom-id');
    assert.equal(problems[0].title, 'Custom Title');
    assert.equal(problems[0].order, 42);
    assert.equal(problems[0].kind, 'exam');
  });
});

test('siblings sort by config order, not by folder name or title', async () => {
  await withRoot(async (root) => {
    await group(root, 'g', validGroup('g', 'G', 1));
    await problem(root, 'g/a-first-folder', validProblem('g/a', 'Zed', 2), { 'statement.pdf': 'x' });
    await problem(root, 'g/b-second-folder', validProblem('g/b', 'Abe', 1), { 'statement.pdf': 'x' });
    const problems = await scanOk(root);
    assert.deepEqual(problems.map((p) => p.id), ['g/b', 'g/a']);
  });
});

test('canonical resources map to the right fields', async () => {
  await withRoot(async (root) => {
    await group(root, 'g', validGroup('g', 'G', 1));
    await problem(root, 'g/full', validProblem('g/full', 'Full', 1), {
      'statement.pdf': 'pdf', 'solution.dig': 'dig', 'note.ods': 'ods',
    });
    await problem(root, 'g/csvnote', validProblem('g/csvnote', 'Csv', 2), {
      'solution.dig': 'dig', 'note.csv': 'a,b\n1,2',
    });
    const problems = await scanOk(root);
    const full = problems.find((p) => p.id === 'g/full');
    assert.match(full.pdf, /content\/g\/full\/statement\.pdf$/);
    assert.match(full.dig, /content\/g\/full\/solution\.dig$/);
    assert.match(full.ods, /content\/g\/full\/note\.ods$/);
    assert.equal(full.csv, null);
    assert.equal(full.hasNote, true);
    const csv = problems.find((p) => p.id === 'g/csvnote');
    assert.match(csv.csv, /content\/g\/csvnote\/note\.csv$/);
    assert.equal(csv.ods, null);
    assert.equal(csv.hasNote, true);
  });
});

test('pdf-only and dig-only problems are both valid', async () => {
  await withRoot(async (root) => {
    await group(root, 'g', validGroup('g', 'G', 1));
    await problem(root, 'g/pdf-only', validProblem('g/pdf-only', 'P', 1), { 'statement.pdf': 'x' });
    await problem(root, 'g/dig-only', validProblem('g/dig-only', 'D', 2), { 'solution.dig': 'x' });
    const problems = await scanOk(root);
    assert.equal(problems.length, 2);
    assert.ok(problems[0].pdf && !problems[0].dig);
    assert.ok(!problems[1].pdf && problems[1].dig);
  });
});

/* ---------- Error cases ---------- */

test('note.ods and note.csv together must fail', async () => {
  await withRoot(async (root) => {
    await group(root, 'g', validGroup('g', 'G', 1));
    await problem(root, 'g/p', validProblem('g/p', 'P', 1), { 'solution.dig': 'x', 'note.ods': 'a', 'note.csv': 'b' });
    await assertScanFails(root, 'both note.ods and note.csv');
  });
});

test('PDF with a non-canonical name must fail', async () => {
  await withRoot(async (root) => {
    await group(root, 'g', validGroup('g', 'G', 1));
    await problem(root, 'g/p', validProblem('g/p', 'P', 1), { 'random.pdf': 'x', 'solution.dig': 'd' });
    await assertScanFails(root, 'non-canonical PDF');
  });
});

test('DIG with a non-canonical name must fail', async () => {
  await withRoot(async (root) => {
    await group(root, 'g', validGroup('g', 'G', 1));
    await problem(root, 'g/p', validProblem('g/p', 'P', 1), { 'circuit.dig': 'x' });
    await assertScanFails(root, 'non-canonical DIG');
  });
});

test('note with a non-canonical name must fail', async () => {
  await withRoot(async (root) => {
    await group(root, 'g', validGroup('g', 'G', 1));
    await problem(root, 'g/p', validProblem('g/p', 'P', 1), { 'solution.dig': 'd', 'scratch.ods': 'x' });
    await assertScanFails(root, 'non-canonical note');
  });
});

test('orphan resource without metadata.json must fail', async () => {
  await withRoot(async (root) => {
    await group(root, 'g', validGroup('g', 'G', 1));
    await problem(root, 'g/p', validProblem('g/p', 'P', 1), { 'statement.pdf': 'x' });
    // A stray resource in the GROUP directory (no metadata.json) is orphaned.
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(root, 'content', 'g', 'loose.pdf'), 'x');
    await assertScanFails(root, 'orphan resource');
  });
});

test('problem with neither statement nor solution must fail', async () => {
  await withRoot(async (root) => {
    await group(root, 'g', validGroup('g', 'G', 1));
    await problem(root, 'g/p', validProblem('g/p', 'P', 1), { 'note.ods': 'x' });
    await assertScanFails(root, 'must have statement.pdf or solution.dig');
  });
});

test('duplicate problem ids must fail', async () => {
  await withRoot(async (root) => {
    await group(root, 'g', validGroup('g', 'G', 1));
    await problem(root, 'g/a', validProblem('g/shared', 'A', 1), { 'statement.pdf': 'x' });
    await problem(root, 'g/b', validProblem('g/shared', 'B', 2), { 'statement.pdf': 'x' });
    await assertScanFails(root, 'duplicate problem id');
  });
});

test('duplicate aliases across problems must fail', async () => {
  await withRoot(async (root) => {
    await group(root, 'g', validGroup('g', 'G', 1));
    await problem(root, 'g/a', validProblem('g/a', 'A', 1, { aliases: ['Old/A'] }), { 'statement.pdf': 'x' });
    await problem(root, 'g/b', validProblem('g/b', 'B', 2, { aliases: ['Old/A'] }), { 'statement.pdf': 'x' });
    await assertScanFails(root, 'duplicate alias');
  });
});

test('alias colliding with another problem canonical id must fail', async () => {
  await withRoot(async (root) => {
    await group(root, 'g', validGroup('g', 'G', 1));
    await problem(root, 'g/a', validProblem('g/a', 'A', 1), { 'statement.pdf': 'x' });
    await problem(root, 'g/b', validProblem('g/b', 'B', 2, { aliases: ['g/a'] }), { 'statement.pdf': 'x' });
    await assertScanFails(root, 'collides with the canonical id');
  });
});

test('duplicate sibling orders must fail (problems and groups)', async () => {
  await withRoot(async (root) => {
    await group(root, 'g', validGroup('g', 'G', 1));
    await problem(root, 'g/a', validProblem('g/a', 'A', 1), { 'statement.pdf': 'x' });
    await problem(root, 'g/b', validProblem('g/b', 'B', 1), { 'statement.pdf': 'x' });
    await assertScanFails(root, 'duplicate problem order');
  });
  await withRoot(async (root) => {
    await group(root, 'one', validGroup('one', 'One', 1));
    await group(root, 'two', validGroup('two', 'Two', 1));
    await problem(root, 'one/p', validProblem('one/p', 'P', 1), { 'statement.pdf': 'x' });
    await assertScanFails(root, 'duplicate group order');
  });
});

test('group directory missing group.json must fail', async () => {
  await withRoot(async (root) => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.join(root, 'content', 'nogroup'), { recursive: true });
    await problem(root, 'nogroup/p', validProblem('nogroup/p', 'P', 1), { 'statement.pdf': 'x' });
    await assertScanFails(root, 'cannot read config');
  });
});

test('malformed JSON config must fail', async () => {
  await withRoot(async (root) => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(path.join(root, 'content', 'g'), { recursive: true });
    await writeFile(path.join(root, 'content', 'g', 'group.json'), '{not json');
    await assertScanFails(root, 'malformed JSON');
  });
});

test('unsupported schemaVersion must fail', async () => {
  await withRoot(async (root) => {
    await group(root, 'g', { schemaVersion: 2, id: 'g', title: 'G', order: 1 });
    await problem(root, 'g/p', validProblem('g/p', 'P', 1), { 'statement.pdf': 'x' });
    await assertScanFails(root, 'unsupported schemaVersion');
  });
});

test('junk system files are ignored with warnings, never enter the manifest', async () => {
  await withRoot(async (root) => {
    await group(root, 'g', validGroup('g', 'G', 1));
    const { writeFile } = await import('node:fs/promises');
    await problem(root, 'g/p', validProblem('g/p', 'P', 1), { 'statement.pdf': 'x' });
    await writeFile(path.join(root, 'content', 'g', 'p', 'desktop.ini'), 'junk');
    await writeFile(path.join(root, 'content', 'g', 'p', '.~lock.note.ods#'), 'lock');
    const { problems, warnings } = await scanContent(root);
    assert.equal(problems.length, 1);
    assert.equal(problems[0].ods, null);
    assert.equal(problems[0].hasNote, false);
    assert.ok(warnings.some((w) => w.includes('desktop.ini')));
    assert.ok(warnings.some((w) => w.includes('~lock')));
  });
});

/* ---------- Unit-level validators ---------- */

test('validateGroupConfig rejects bad fields with field context', async () => {
  await assert.throws(() => validateGroupConfig({ ...validGroup('a', 'A', 1), order: 'x' }, { file: 'f' }), /order/);
  await assert.throws(() => validateGroupConfig({ ...validGroup('a', 'A', 1), title: '' }, { file: 'f' }), /title/);
  await assert.throws(() => validateGroupConfig({ ...validGroup('a', 'A', 1), id: 5 }, { file: 'f' }), /id/);
});

test('validateProblemConfig requires aliases array', async () => {
  await assert.throws(() => validateProblemConfig({ ...validProblem('a', 'A', 1), aliases: 'nope' }, { file: 'f' }), /aliases/);
});

test('readJsonFile reports malformed JSON with file path', async () => {
  await withRoot(async (root) => {
    const { writeFile } = await import('node:fs/promises');
    const file = path.join(root, 'bad.json');
    await writeFile(file, '{oops');
    await assert.rejects(() => readJsonFile(file), (error) => {
      assert.match(error.message, /malformed JSON/);
      assert.equal(error.file, file);
      return true;
    });
  });
});

test('detectCanonicalResources flags conflicts and non-canonical names directly', async () => {
  await withRoot(async (root) => {
    const dir = path.join(root, 'content', 'p');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(dir, { recursive: true });
    await assert.rejects(
      () => detectCanonicalResources(dir, 'content/p', { file: 'metadata.json' }),
      /must have statement.pdf or solution.dig/,
    );
    await writeFile(path.join(dir, 'a.pdf'), 'x');
    await assert.rejects(
      () => detectCanonicalResources(dir, 'content/p', { file: 'metadata.json' }),
      /non-canonical PDF/,
    );
  });
});

test('validateSiblingOrders reports duplicates', async () => {
  assert.throws(
    () => validateSiblingOrders([{ order: 1, id: 'a' }, { order: 1, id: 'b' }], { type: 'problem', parent: 'g' }),
    /duplicate problem order 1/,
  );
});

test('buildProblemRecord computes hasNote and keeps null resources', async () => {
  const record = buildProblemRecord(
    validProblem('x/y', 'Y', 1),
    { pdf: 'content/x/y/statement.pdf', dig: null, ods: null, csv: null },
    ['X'],
  );
  assert.equal(record.hasNote, false);
  assert.equal(record.dig, null);
  assert.deepEqual(record.groupPath, ['X']);
});

/* ---------- Config-driven extensibility ---------- */

test('adding a brand-new group and problem needs no code changes', async () => {
  await withRoot(async (root) => {
    await minimalTree(root);
    // Administrator adds a whole new tree with arbitrary naming.
    await group(root, 'new-topic', validGroup('new-topic', 'Videos Soon', 3));
    await group(root, 'new-topic/level-two', validGroup('new-topic/level-two', 'Deep', 1));
    await problem(root, 'new-topic/level-two/first', validProblem('new-topic/level-two/first', 'First', 1, { kind: 'quiz' }), {
      'statement.pdf': 'x', 'solution.dig': 'y',
    });
    const problems = await scanOk(root);
    assert.equal(problems.length, 4);
    const added = problems.find((p) => p.id === 'new-topic/level-two/first');
    assert.deepEqual(added.groupPath, ['Videos Soon', 'Deep']);
    assert.equal(added.kind, 'quiz');
  });
});

test('group with mixed direct problems and child groups works', async () => {
  await withRoot(async (root) => {
    await group(root, 'mixed', validGroup('mixed', 'Mixed', 1));
    await group(root, 'mixed/sub', validGroup('mixed/sub', 'Sub', 1));
    await problem(root, 'mixed/direct', validProblem('mixed/direct', 'Direct', 1), { 'statement.pdf': 'x' });
    await problem(root, 'mixed/sub/nested', validProblem('mixed/sub/nested', 'Nested', 1), { 'solution.dig': 'x' });
    const problems = await scanOk(root);
    assert.equal(problems.length, 2);
    // DFS emits the nested sub-group's problems before the parent's direct ones.
    assert.deepEqual(problems.map((p) => p.id), ['mixed/sub/nested', 'mixed/direct']);
    const direct = problems.find((p) => p.id === 'mixed/direct');
    const nested = problems.find((p) => p.id === 'mixed/sub/nested');
    assert.deepEqual(direct.groupPath, ['Mixed']);
    assert.deepEqual(nested.groupPath, ['Mixed', 'Sub']);
  });
});

/* ---------- Baseline comparison (real repository) ---------- */

test('migrated repository preserves baseline problem and resource counts', async () => {
  const baseline = JSON.parse(await readFile(path.join(repoRoot, 'test', 'fixtures', 'baseline.json'), 'utf8'));
  const current = await scanOk(repoRoot);
  const count = (list, key) => list.filter((item) => item[key]).length;
  assert.equal(current.length, baseline.length, 'problem count must match baseline');
  assert.equal(count(current, 'pdf'), count(baseline, 'pdf'), 'statement count must match baseline');
  assert.equal(count(current, 'dig'), count(baseline, 'dig'), 'solution count must match baseline');
  assert.equal(count(current, 'ods'), count(baseline, 'ods'), 'ods count must match baseline');
  assert.equal(count(current, 'csv'), count(baseline, 'csv'), 'csv count must match baseline');
});

test('every baseline problem id resolves via alias in the migrated tree', async () => {
  const baseline = JSON.parse(await readFile(path.join(repoRoot, 'test', 'fixtures', 'baseline.json'), 'utf8'));
  const current = await scanOk(repoRoot);
  const { resolveProblemByIdOrAlias } = await import('../src/lib/content.js');
  for (const old of baseline) {
    const resolved = resolveProblemByIdOrAlias(current, old.id);
    assert.ok(resolved, `old id "${old.id}" must resolve through aliases`);
    assert.equal(resolved.title, old.title, `title preserved for ${old.id}`);
  }
});
