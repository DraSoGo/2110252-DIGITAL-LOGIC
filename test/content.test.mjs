import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { buildTree, countTree, filterProblems, pageRoute, parseCsv, resolveProblemByIdOrAlias, summarize } from '../src/lib/content.js';
import { copyContentTree } from '../scripts/lib/dist-copy.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const problems = [
  { id: 'exam-1/66/01', title: '01', aliases: ['Exam1/66/01'], groupPath: ['Exam1', '66'], pdf: 'a.pdf', dig: 'a.dig', ods: null, csv: null, hasNote: false },
  { id: 'exam-1/66/02', title: '02', aliases: ['Exam1/66/02'], groupPath: ['Exam1', '66'], pdf: null, dig: 'b.dig', ods: 'b.ods', csv: null, hasNote: true },
  { id: 'labs/lab-3/deep/task', title: 'task', aliases: [], groupPath: ['Labs', 'Lab 3', 'deep'], pdf: 'c.pdf', dig: null, ods: null, csv: 'c.csv', hasNote: true },
];

/* ---------- Tree ---------- */

test('buildTree nests groups recursively and numbers siblings locally', () => {
  const tree = buildTree(problems);
  assert.equal(tree.length, 2);
  const exams = tree.find((n) => n.name === 'Exam1');
  assert.equal(exams.children.length, 1);
  assert.equal(exams.children[0].problems.length, 2);
  const labs = tree.find((n) => n.name === 'Labs');
  const deep = labs.children[0].children[0];
  assert.equal(deep.path, 'Labs/Lab 3/deep');
  assert.deepEqual(deep.problems.map((p) => p.id), ['labs/lab-3/deep/task']);
});

test('tree numbering restarts per parent', () => {
  const tree = buildTree(problems);
  assert.deepEqual(tree.map((n) => n.code), ['01', '02']);
  assert.deepEqual(tree[0].children.map((n) => n.code), ['01']);
  assert.deepEqual(tree[1].children.map((n) => n.code), ['01']);
});

test('countTree counts nested problems', () => {
  const tree = buildTree(problems);
  assert.equal(countTree(tree[0]), 2);
  assert.equal(countTree(tree[1]), 1);
});

/* ---------- Search (covers canonical id, alias, title, group title) ---------- */

test('filterProblems matches canonical id', () => {
  assert.equal(filterProblems(problems, { query: 'exam-1/66' }).length, 2);
});

test('filterProblems matches legacy aliases', () => {
  const hits = filterProblems(problems, { query: 'Exam1/66/01' });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'exam-1/66/01');
});

test('filterProblems matches titles and group titles (word-AND, underscore-normalised)', () => {
  assert.equal(filterProblems(problems, { query: 'lab 3' }).length, 1);
  assert.equal(filterProblems(problems, { query: 'task' }).length, 1);
  assert.equal(filterProblems(problems, { query: 'EXAM1' }).length, 2);
  assert.equal(filterProblems(problems, { query: 'zzz' }).length, 0);
  assert.equal(filterProblems(problems, { query: '' }).length, 3);
});

/* ---------- Routing ---------- */

test('pageRoute parses overview and encoded problem ids', () => {
  assert.deepEqual(pageRoute('#/'), { page: 'overview', problemId: null });
  assert.deepEqual(pageRoute(''), { page: 'overview', problemId: null });
  assert.deepEqual(pageRoute('#/problem/exam-1%2F66%2F01'), { page: 'problem', problemId: 'exam-1/66/01' });
  assert.deepEqual(pageRoute('#/problem/Exam1%2F66%2F01'), { page: 'problem', problemId: 'Exam1/66/01' });
});

test('resolveProblemByIdOrAlias resolves canonical ids and legacy aliases', () => {
  assert.equal(resolveProblemByIdOrAlias(problems, 'exam-1/66/01')?.id, 'exam-1/66/01');
  assert.equal(resolveProblemByIdOrAlias(problems, 'Exam1/66/01')?.id, 'exam-1/66/01');
  assert.equal(resolveProblemByIdOrAlias(problems, 'Exam1/66/02')?.id, 'exam-1/66/02');
  assert.equal(resolveProblemByIdOrAlias(problems, 'nope/nope'), null);
  assert.equal(resolveProblemByIdOrAlias(problems, null), null);
  // a canonical id of one problem must not resolve through another's aliases
  assert.equal(resolveProblemByIdOrAlias(problems, 'labs/lab-3/deep/task')?.id, 'labs/lab-3/deep/task');
});

/* ---------- Summary ---------- */

test('summarize counts resources', () => {
  const s = summarize(problems);
  assert.equal(s.problems, 3);
  assert.equal(s.groups, 5);
  assert.equal(s.pdfs, 2);
  assert.equal(s.digs, 2);
  assert.equal(s.notes, 2);
});

/* ---------- CSV parser ---------- */

test('parseCsv handles quotes, commas, escaped quotes, CRLF', () => {
  assert.deepEqual(parseCsv('a,b\r\n"1,5",2\n"say ""hi""",x'), [['a', 'b'], ['1,5', '2'], ['say "hi"', 'x']]);
});

test('parseCsv ignores trailing empty line and keeps empty fields', () => {
  assert.deepEqual(parseCsv('a,b\n'), [['a', 'b']]);
  assert.deepEqual(parseCsv('a,,c'), [['a', '', 'c']]);
});

/* ---------- dist copy (build output) ---------- */

async function withTempDir(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'diglo-dist-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('copyContentTree copies resources but never configs or junk', async () => {
  await withTempDir(async (work) => {
    const source = path.join(work, 'content');
    await mkdir(path.join(source, 'g', 'p'), { recursive: true });
    await writeFile(path.join(source, 'g', 'group.json'), '{}');
    await writeFile(path.join(source, 'g', 'p', 'metadata.json'), '{}');
    await writeFile(path.join(source, 'g', 'p', 'statement.pdf'), 'pdf');
    await writeFile(path.join(source, 'g', 'p', 'solution.dig'), 'dig');
    await writeFile(path.join(source, 'g', 'p', 'desktop.ini'), 'junk');
    await writeFile(path.join(source, 'g', 'p', '.~lock.note.ods#'), 'lock');

    const target = path.join(work, 'dist', 'content');
    const copied = await copyContentTree(source, target);

    assert.equal(copied, 2, 'only the two resources are copied');
    assert.equal(await readFile(path.join(target, 'g', 'p', 'statement.pdf'), 'utf8'), 'pdf');
    assert.equal(await readFile(path.join(target, 'g', 'p', 'solution.dig'), 'utf8'), 'dig');
    for (const missing of ['g/group.json', 'g/p/metadata.json', 'g/p/desktop.ini']) {
      await assert.rejects(() => readFile(path.join(target, ...missing.split('/'))), /ENOENT/, `${missing} must not reach dist`);
    }
  });
});

test('real repository dist copy preserves resource counts', async () => {
  // Uses the real content tree; mirrors what build.mjs produces.
  const manifest = JSON.parse(await readFile(path.join(repoRoot, 'data', 'problems.json'), 'utf8'));
  await withTempDir(async (work) => {
    const target = path.join(work, 'dist', 'content');
    const copied = await copyContentTree(path.join(repoRoot, 'content'), target);
    const expected = manifest.reduce((sum, p) => sum + ['pdf', 'dig', 'ods', 'csv'].filter((k) => p[k]).length, 0);
    assert.equal(copied, expected, 'copied file count equals manifest resource count');
    for (const problem of manifest) {
      for (const key of ['pdf', 'dig', 'ods', 'csv']) {
        if (!problem[key]) continue;
        await readFile(path.join(work, 'dist', problem[key])); // throws if missing
      }
    }
  });
});
