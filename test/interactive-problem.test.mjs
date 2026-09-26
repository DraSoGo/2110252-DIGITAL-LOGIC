import test from 'node:test';
import assert from 'node:assert/strict';
import { interactivePageHref, resolveInteractiveProblem } from '../src/lib/interactive-problem.js';

const problems = [
  { id: 'simulation/lab-01/01', aliases: ['Simulation/Lab_01/01'], dig: 'content/simulation/lab-01/01/solution.dig' },
  { id: 'exam-1/66/01', aliases: [], dig: null },
];

test('interactive resolver accepts only a canonical configured solution id', () => {
  const result = resolveInteractiveProblem(problems, '?problem=simulation%2Flab-01%2F01');
  assert.equal(result.problem.id, 'simulation/lab-01/01');
  assert.equal(result.error, null);
});

test('interactive resolver rejects aliases, missing ids, unknown ids, and problems without a solution', () => {
  assert.equal(resolveInteractiveProblem(problems, '?problem=Simulation%2FLab_01%2F01').error, 'unknown-problem');
  assert.equal(resolveInteractiveProblem(problems, '').error, 'missing-problem');
  assert.equal(resolveInteractiveProblem(problems, '?problem=nope').error, 'unknown-problem');
  assert.equal(resolveInteractiveProblem(problems, '?problem=exam-1%2F66%2F01').error, 'missing-solution');
});

test('interactive page href preserves the GitHub Pages base path', () => {
  assert.equal(
    interactivePageHref('simulation/lab-01/01', 'https://example.test/2110252-DIGITAL-LOGIC/'),
    'https://example.test/2110252-DIGITAL-LOGIC/interactive.html?problem=simulation%2Flab-01%2F01',
  );
});
