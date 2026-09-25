import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABS, isTabAvailable, tabListMarkup, tabPanelMarkup } from '../src/lib/tabs.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- Loading lifecycle (regression: app-loading stuck on #app) ---------- */

test('index.html keeps the loading screen in a child element, not as #app classes', async () => {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  // #app itself must be a plain container — never carries the centering class.
  assert.doesNotMatch(html, /<div id="app"[^>]*class=/, '#app must not have classes in initial markup');
  assert.doesNotMatch(html, /<div id="app"[^>]*role=/, '#app must not be a live status region');
  // The boot screen is a child so it can be removed without touching #app.
  assert.match(html, /<div id="boot-screen" class="app-loading"/, 'boot screen must be a child element with its own id');
});

test('clearBootState contract: the booted shell renders inside a bare #app', async () => {
  const source = await readFile(path.join(root, 'src', 'app.js'), 'utf8');
  // Boot must strip every loading-era attribute before rendering the shell.
  assert.match(source, /function clearBootState\(\)/, 'app must define clearBootState');
  for (const attr of ['class', 'role', 'aria-live', 'aria-busy']) {
    assert.match(source, new RegExp(`removeAttribute\\('${attr}'\\)`), `clearBootState must remove ${attr}`);
  }
  // clearBootState must run before the shell is mounted.
  const clearPos = source.indexOf('function clearBootState');
  const bootPos = source.indexOf('clearBootState();');
  const shellPos = source.indexOf('app.innerHTML = shellMarkup()');
  assert.ok(clearPos >= 0 && bootPos > clearPos && shellPos > bootPos, 'clearBootState() must run before shellMarkup is mounted');
});

/* ---------- ARIA tabs pattern ---------- */

const fakeIcon = () => '';
const fullProblem = { pdf: 'a.pdf', dig: 'a.dig', ods: null, csv: 'a.csv', hasNote: true };
const digOnly = { pdf: null, dig: 'b.dig', ods: null, csv: null, hasNote: false };

test('isTabAvailable reflects each resource type', () => {
  assert.equal(isTabAvailable('statement', fullProblem), true);
  assert.equal(isTabAvailable('solution', fullProblem), true);
  assert.equal(isTabAvailable('note', fullProblem), true);
  assert.equal(isTabAvailable('statement', digOnly), false);
  assert.equal(isTabAvailable('solution', digOnly), true);
  assert.equal(isTabAvailable('note', digOnly), false);
});

test('tab list: every tab has id, aria-controls, correct tabindex and one selection', () => {
  const markup = tabListMarkup(fullProblem, fakeIcon);
  for (const tab of TABS) {
    assert.match(markup, new RegExp(`id="tab-${tab.id}"`), `tab ${tab.id} needs an id`);
    assert.match(markup, new RegExp(`aria-controls="panel-${tab.id}"`), `tab ${tab.id} needs aria-controls`);
    assert.match(markup, new RegExp(`role="tab"[^>]*id="tab-${tab.id}"|id="tab-${tab.id}"[^>]*role="tab"`), `tab ${tab.id} needs role=tab`);
  }
  const selected = [...markup.matchAll(/aria-selected="(true|false)"/g)].map((m) => m[1]);
  assert.equal(selected.length, TABS.length);
  assert.equal(selected.filter((value) => value === 'true').length, 1, 'exactly one tab selected');
  // Selected tab is tabbable; the others are removed from tab order.
  assert.match(markup, /aria-selected="true" tabindex="0"|tabindex="0" aria-selected="true"/);
  assert.equal((markup.match(/tabindex="-1"/g) || []).length, TABS.length - 1);
});

test('tab list: selected tab can be changed', () => {
  const markup = tabListMarkup(fullProblem, fakeIcon, { selected: 'solution' });
  assert.match(markup, /id="tab-solution"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="tab-solution"/);
  assert.equal((markup.match(/tabindex="0"/g) || []).length, 1);
});

test('tab panels are labelled and hidden panels stay out of the tree', () => {
  const visible = tabPanelMarkup('statement', 'X');
  const hidden = tabPanelMarkup('note', 'Y', { hidden: true });
  assert.match(visible, /id="panel-statement"/);
  assert.match(visible, /aria-labelledby="tab-statement"/);
  assert.match(visible, /role="tabpanel"/);
  assert.match(visible, /tabindex="0"/);
  assert.doesNotMatch(visible, /hidden/);
  assert.match(hidden, /hidden/);
  assert.match(hidden, /aria-labelledby="tab-note"/);
});
