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

test('tree numbering restarts per parent (regression: Lab_01 must be 01 after Exam1 children)', () => {
  // Two roots, each with children at the same depth — the old global counter
  // drifted across parents (Simulation/Lab_01 became 04 after Exam1's 66/67/68).
  const many = [
    { id: 'Exam1/66/01', title: 'a', groupPath: ['Exam1', '66'], pdf: 'x.pdf', dig: null, ods: null, csv: null, hasNote: false },
    { id: 'Exam1/67/01', title: 'b', groupPath: ['Exam1', '67'], pdf: 'x.pdf', dig: null, ods: null, csv: null, hasNote: false },
    { id: 'Exam1/68/01', title: 'c', groupPath: ['Exam1', '68'], pdf: 'x.pdf', dig: null, ods: null, csv: null, hasNote: false },
    { id: 'Simulation/Lab_01/01', title: 'd', groupPath: ['Simulation', 'Lab_01'], pdf: 'x.pdf', dig: null, ods: null, csv: null, hasNote: false },
    { id: 'Simulation/Lab_02/01', title: 'e', groupPath: ['Simulation', 'Lab_02'], pdf: 'x.pdf', dig: null, ods: null, csv: null, hasNote: false },
    { id: 'Simulation/Lab_03/01', title: 'f', groupPath: ['Simulation', 'Lab_03'], pdf: 'x.pdf', dig: null, ods: null, csv: null, hasNote: false },
    { id: 'Simulation/Lab_04/01', title: 'g', groupPath: ['Simulation', 'Lab_04'], pdf: 'x.pdf', dig: null, ods: null, csv: null, hasNote: false },
  ];
  const tree = buildTree(many);
  const rootCodes = tree.map((n) => n.code);
  assert.deepEqual(rootCodes, ['01', '02']);
  const exam1 = tree.find((n) => n.name === 'Exam1');
  assert.deepEqual(exam1.children.map((n) => `${n.code}:${n.name}`), ['01:66', '02:67', '03:68']);
  const simulation = tree.find((n) => n.name === 'Simulation');
  assert.deepEqual(simulation.children.map((n) => `${n.code}:${n.name}`), ['01:Lab_01', '02:Lab_02', '03:Lab_03', '04:Lab_04']);
});

test('tree numbering restarts at every nesting level', () => {
  const deep = [
    { id: 'A/B/C/01', title: 't', groupPath: ['A', 'B', 'C'], pdf: 'x.pdf', dig: null, ods: null, csv: null, hasNote: false },
    { id: 'A/D/01', title: 't', groupPath: ['A', 'D'], pdf: 'x.pdf', dig: null, ods: null, csv: null, hasNote: false },
    { id: 'A/E/01', title: 't', groupPath: ['A', 'E'], pdf: 'x.pdf', dig: null, ods: null, csv: null, hasNote: false },
  ];
  const tree = buildTree(deep);
  const a = tree[0];
  assert.equal(a.code, '01');
  assert.deepEqual(a.children.map((n) => n.code), ['01', '02', '03']);
  const b = a.children[0];
  assert.deepEqual(b.children.map((n) => n.code), ['01']);
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
