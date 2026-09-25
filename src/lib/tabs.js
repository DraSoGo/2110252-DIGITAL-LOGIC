// Tab list + panel markup for the problem view, extracted as pure functions
// so the ARIA tabs pattern is unit-testable without a DOM.

export const TABS = [
  { id: 'statement', label: 'STATEMENT', kind: 'file' },
  { id: 'solution', label: 'SOLUTION', kind: 'circuit' },
  { id: 'note', label: 'NOTE', kind: 'note' },
];

export function isTabAvailable(tabId, problem) {
  if (tabId === 'statement') return Boolean(problem.pdf);
  if (tabId === 'solution') return Boolean(problem.dig);
  return Boolean(problem.ods || problem.csv);
}

export function tabListMarkup(problem, icon, { selected = 'statement' } = {}) {
  const buttons = TABS.map((tab) => {
    const available = isTabAvailable(tab.id, problem);
    const isSelected = tab.id === selected;
    return `<button role="tab" id="tab-${tab.id}" aria-controls="panel-${tab.id}" aria-selected="${isSelected}" tabindex="${isSelected ? 0 : -1}" data-tab="${tab.id}">${icon(tab.kind)}<span>${tab.label}</span><small>${available ? 'READY' : 'MISSING'}</small></button>`;
  }).join('');
  return `<div class="tab-bar" role="tablist" aria-label="Problem resources">${buttons}</div>`;
}

export function tabPanelMarkup(tabId, inner, { hidden = false } = {}) {
  return `<section class="tab-panel" id="panel-${tabId}" role="tabpanel" aria-labelledby="tab-${tabId}" tabindex="0"${hidden ? ' hidden' : ''}>${inner}</section>`;
}
