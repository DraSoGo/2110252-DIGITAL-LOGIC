import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prettify, scanProblemLibrary } from '../scripts/lib/manifest.mjs';

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'library');

test('prettify converts underscores and collapses spaces', () => {
  assert.equal(prettify('Full_Address_2'), 'Full Address 2');
  assert.equal(prettify('  weird   name '), 'weird name');
  assert.equal(prettify('01'), '01');
});

test('scanner detects problems and groups at any depth', async () => {
  const problems = await scanProblemLibrary(fixtureRoot);
  const ids = problems.map((p) => p.id);
  assert.deepEqual(ids.sort(), [
    'Exams/Final/10',
    'Exams/Midterm/01',
    'Exams/Midterm/02',
    'Hidden/inner/02',
    'Hidden/inner/10',
    'Labs/Lab_A',
    'Labs/Lab_B/part1',
  ]);
});

test('problem folder picks first file of each type with prettified title', async () => {
  const problems = await scanProblemLibrary(fixtureRoot);
  const p = problems.find((item) => item.id === 'Exams/Midterm/01');
  assert.equal(p.title, '01');
  assert.equal(p.pdf, 'Exams/Midterm/01/01.pdf');
  assert.equal(p.dig, 'Exams/Midterm/01/b_circuit.dig');
  assert.equal(p.ods, 'Exams/Midterm/01/01.ods');
  assert.equal(p.csv, 'Exams/Midterm/01/01.csv');
  assert.equal(p.hasNote, true);
  assert.deepEqual(p.groupPath, ['Exams', 'Midterm']);
});

test('dig-only problem has null pdf and no note', async () => {
  const problems = await scanProblemLibrary(fixtureRoot);
  const p = problems.find((item) => item.id === 'Exams/Midterm/02');
  assert.equal(p.pdf, null);
  assert.equal(p.dig, 'Exams/Midterm/02/solution.dig');
  assert.equal(p.ods, null);
  assert.equal(p.csv, null);
  assert.equal(p.hasNote, false);
});

test('csv-only folder is not a problem and is skipped entirely', async () => {
  const problems = await scanProblemLibrary(fixtureRoot);
  assert.equal(problems.some((p) => p.id.startsWith('NotesOnly')), false);
});

test('natural sort: 02 sorts before 10', async () => {
  const problems = await scanProblemLibrary(fixtureRoot);
  const hidden = problems.filter((p) => p.id.startsWith('Hidden/inner'));
  assert.deepEqual(hidden.map((p) => p.id), ['Hidden/inner/02', 'Hidden/inner/10']);
});

test('junk files (desktop.ini, lock files) never become resources', async () => {
  const problems = await scanProblemLibrary(fixtureRoot);
  for (const p of problems) {
    for (const key of ['pdf', 'dig', 'ods', 'csv']) {
      assert.ok(!p[key] || (!p[key].includes('desktop.ini') && !p[key].includes('~lock')), `${p.id}.${key} picked a junk file`);
    }
  }
});
