import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTree, countTree, filterProblems, pageRoute, parseCsv, prettifyTitle, summarize } from '../src/lib/content.js';

const problems = [
  { id: 'Exams/67/01', title: '01', groupPath: ['Exams', '67'], pdf: 'a.pdf', dig: 'a.dig', ods: null, csv: null, hasNote: false },
  { id: 'Exams/67/02', title: '02', groupPath: ['Exams', '67'], pdf: null, dig: 'b.dig', ods: 'b.ods', csv: null, hasNote: true },
  { id: 'Labs/Lab 3/deep/task', title: 'task', groupPath: ['Labs', 'Lab 3', 'deep'], pdf: 'c.pdf', dig: null, ods: null, csv: 'c.csv', hasNote: true },
];

test('prettifyTitle matches manifest prettify', () => {
  assert.equal(prettifyTitle('Full_Address_2'), 'Full Address 2');
});

test('buildTree nests groups recursively', () => {
  const tree = buildTree(problems);
  assert.equal(tree.length, 2);
  const exams = tree.find((n) => n.name === 'Exams');
  assert.equal(exams.problems.length, 0);
  assert.equal(exams.children.length, 1);
  assert.equal(exams.children[0].problems.length, 2);
  const labs = tree.find((n) => n.name === 'Labs');
  const deep = labs.children[0].children[0];
  assert.equal(deep.path, 'Labs/Lab 3/deep');
  assert.deepEqual(deep.problems.map((p) => p.id), ['Labs/Lab 3/deep/task']);
});

test('countTree counts nested problems', () => {
  const tree = buildTree(problems);
  assert.equal(countTree(tree[0]), 2);
  assert.equal(countTree(tree[1]), 1);
});

test('filterProblems matches title and full path, case-insensitive', () => {
  assert.equal(filterProblems(problems, { query: 'lab 3' }).length, 1);
  assert.equal(filterProblems(problems, { query: 'EXAMS' }).length, 2);
  assert.equal(filterProblems(problems, { query: 'zzz' }).length, 0);
  assert.equal(filterProblems(problems, { query: '' }).length, 3);
});

test('pageRoute parses overview and encoded problem ids', () => {
  assert.deepEqual(pageRoute('#/'), { page: 'overview', problemId: null });
  assert.deepEqual(pageRoute(''), { page: 'overview', problemId: null });
  assert.deepEqual(pageRoute('#/problem/Exams%2F67%2F01'), { page: 'problem', problemId: 'Exams/67/01' });
});

test('summarize counts resources', () => {
  const s = summarize(problems);
  assert.equal(s.problems, 3);
  assert.equal(s.groups, 5); // Exams, 67, Labs, Lab 3, deep
  assert.equal(s.pdfs, 2);
  assert.equal(s.digs, 2);
  assert.equal(s.notes, 2);
});

test('parseCsv handles quotes, commas, escaped quotes, CRLF', () => {
  const rows = parseCsv('a,b\r\n"1,5",2\n"say ""hi""",x');
  assert.deepEqual(rows, [['a', 'b'], ['1,5', '2'], ['say "hi"', 'x']]);
});

test('parseCsv ignores trailing empty line', () => {
  assert.deepEqual(parseCsv('a,b\n'), [['a', 'b']]);
});

test('parseCsv keeps rows containing empty fields', () => {
  assert.deepEqual(parseCsv('a,,c'), [['a', '', 'c']]);
});
