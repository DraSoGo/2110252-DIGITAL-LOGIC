import { buildTree, countTree, filterProblems, pageRoute, resolveProblemByIdOrAlias, summarize } from './lib/content.js';
import { createSvgViewer } from './lib/svg-viewer.js';
import { TABS, isTabAvailable } from './lib/tabs.js';

const app = document.querySelector('#app');
const state = { problems: [], query: '', openGroups: new Set(), closedGroups: new Set(), sidebarOpen: false, viewer: null };
let solutionToken = 0;

const icon = (name) => ({
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v5h5"/></svg>',
  circuit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14h6a7 7 0 0 0 0-14H7z"/><path d="M2 9h5M2 15h5M13 12h9"/></svg>',
  note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 16h10"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8 8 0 0 1 8.5 4 8.2 8.2 0 1 0 20 15.5Z"/></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M19 14v6H4V5h6"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0 5-5m-5 5-5-5M5 20h14"/></svg>',
  zap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
})[name];

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function asset(path) { return new URL(path, document.baseURI).href; }
function basename(path) { return path ? path.split('/').pop() : ''; }

function activeProblem() {
  const { problemId } = pageRoute(location.hash);
  return problemId ? resolveProblemByIdOrAlias(state.problems, problemId) : null;
}

/* ---------- Boot state lifecycle ---------- */

function showFatal(title, message) {
  app.innerHTML = `<div class="fatal-error" role="alert">
    <code>PANIC: ${escapeHtml(title)}</code>
    <h1>Atlas failed to boot</h1>
    <p>${escapeHtml(message)}</p>
    <button type="button" id="fatal-retry">RETRY</button>
  </div>`;
  document.querySelector('#fatal-retry').addEventListener('click', () => location.reload());
}

// Loading/fatal states are rendered INSIDE #app; the boot screen lives in a
// child element, so #app itself never carries grid-centering classes and the
// real shell always fills the viewport.
function clearBootState() {
  app.removeAttribute('class');
  app.removeAttribute('role');
  app.removeAttribute('aria-live');
  app.removeAttribute('aria-busy');
  app.innerHTML = '';
}

/* ---------- Shell ---------- */

function shellMarkup() {
  const s = summarize(state.problems);
  return `<div class="app-shell">
    <header class="topbar">
      <button class="menu-button" type="button" aria-label="Open navigation" aria-controls="sidebar" aria-expanded="false" id="menu-button">${icon('menu')}</button>
      <a class="wordmark" href="#/"><span class="prompt-mark">&gt;_</span><span><strong>2110252</strong><small>DIGITAL LOGIC</small></span></a>
      <label class="global-search">${icon('search')}<span class="sr-only">Search problems</span><input type="search" id="global-search" placeholder="Search problems..." autocomplete="off"><kbd>/</kbd></label>
      <div class="system-summary"><span>${s.problems}<small>PROBLEMS</small></span><span>${s.pdfs}<small>STATEMENTS</small></span><span>${s.digs}<small>SOLUTIONS</small></span><span>${s.notes}<small>NOTES</small></span></div>
      <button class="theme-button" type="button" aria-label="Toggle color theme">${document.documentElement.dataset.theme === 'dark' ? icon('sun') : icon('moon')}</button>
    </header>
    <div class="workspace">
      <aside class="sidebar" id="sidebar" aria-label="Problem navigation"></aside>
      <button class="sidebar-scrim" type="button" aria-label="Close navigation"></button>
      <main id="main" tabindex="-1"></main>
    </div>
  </div>`;
}

/* ---------- Sidebar tree ---------- */

function activeAncestors() {
  const active = activeProblem();
  if (!active) return new Set();
  const set = new Set();
  let prefix = '';
  for (const segment of active.groupPath) {
    prefix = prefix ? `${prefix}/${segment}` : segment;
    set.add(prefix);
  }
  return set;
}

function groupIsOpen(path, ancestors) {
  if (state.query) return true;
  if (state.openGroups.has(path)) return true;
  if (state.closedGroups.has(path)) return false;
  return ancestors.has(path);
}

function visibleCount(node, visibleIds) {
  const problems = node.problems.filter((p) => !state.query || visibleIds.has(p.id));
  return problems.length + node.children.reduce((sum, child) => sum + visibleCount(child, visibleIds), 0);
}

function treeNodeMarkup(node, depth, ctx) {
  const problems = node.problems.filter((p) => !state.query || ctx.visibleIds.has(p.id));
  const children = node.children.map((child) => treeNodeMarkup(child, depth + 1, ctx)).filter(Boolean);
  if (state.query && !problems.length && !children.length) return '';
  const open = groupIsOpen(node.path, ctx.ancestors);
  const count = visibleCount(node, ctx.visibleIds);
  return `<section class="tree-node ${open ? 'open' : ''}" style="--depth:${depth}">
    <button class="tree-heading" type="button" data-toggle="${escapeHtml(node.path)}" aria-expanded="${open}">
      ${icon('chevron')}<strong><span class="tree-code">${escapeHtml(node.code)}</span>${escapeHtml(node.name)}</strong><span class="tree-count">${count}</span>
    </button>
    <div class="tree-children" ${open ? '' : 'hidden'}>
      ${children.join('')}
      ${problems.map((p) => `<a class="tree-problem ${ctx.active?.id === p.id ? 'active' : ''}" style="--depth:${depth + 1}" href="#/problem/${encodeURIComponent(p.id)}">
        <span class="tree-line"></span>
        <span class="tree-problem-text"><code>${escapeHtml(p.title)}</code><small>${escapeHtml(basename(p.dig || p.pdf || p.id))}</small></span>
        <span class="tree-problem-dots"><span class="dot ${p.pdf ? 'ready' : ''}" title="PDF statement"></span><span class="dot ${p.dig ? 'ready' : ''}" title=".dig solution"></span><span class="dot ${p.hasNote ? 'ready' : ''}" title="Scratch note"></span></span>
      </a>`).join('')}
    </div>
  </section>`;
}

function sidebarMarkup() {
  const tree = buildTree(state.problems);
  const visibleIds = new Set(filterProblems(state.problems, { query: state.query }).map((p) => p.id));
  const ctx = { visibleIds, ancestors: activeAncestors(), active: activeProblem() };
  return `<div class="sidebar-head"><span>COURSE_INDEX</span><button class="sidebar-close" type="button" aria-label="Close navigation">×</button></div>
    <nav class="course-tree" aria-label="Course tree">
      ${tree.map((node) => treeNodeMarkup(node, 0, ctx)).join('')}
      ${state.query && !visibleIds.size ? '<p class="tree-empty">$ grep: no matches<span class="sr-only">No problems match the search.</span></p>' : ''}
    </nav>
    <div class="sidebar-foot"><span><i class="status-led"></i>SYSTEM ONLINE</span><span>v1.0.0</span></div>`;
}

function renderSidebar() {
  const sidebar = document.querySelector('#sidebar');
  if (!sidebar) return;
  sidebar.innerHTML = sidebarMarkup();
  sidebar.querySelectorAll('[data-toggle]').forEach((button) => button.addEventListener('click', () => {
    const path = button.dataset.toggle;
    if (groupIsOpen(path, activeAncestors())) { state.closedGroups.add(path); state.openGroups.delete(path); }
    else { state.openGroups.add(path); state.closedGroups.delete(path); }
    renderSidebar();
  }));
  sidebar.querySelectorAll('.tree-problem').forEach((link) => link.addEventListener('click', () => closeSidebar()));
  const close = sidebar.querySelector('.sidebar-close');
  if (close) close.addEventListener('click', () => closeSidebar(true));
}

function isMobile() { return window.matchMedia('(max-width: 900px)').matches; }

function setSidebar(open) {
  state.sidebarOpen = open;
  const sidebar = document.querySelector('#sidebar');
  const menuButton = document.querySelector('#menu-button');
  sidebar?.classList.toggle('is-open', open);
  if (menuButton) {
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  }
}

function openSidebar({ focus = false } = {}) {
  setSidebar(true);
  if (focus) document.querySelector('.sidebar-close')?.focus();
}

function closeSidebar(returnFocus = false) {
  if (!state.sidebarOpen) return;
  setSidebar(false);
  if (returnFocus) document.querySelector('#menu-button')?.focus();
}

/* ---------- Overview ---------- */

function firstProblemOf(node) {
  if (node.problems.length) return node.problems[0];
  for (const child of node.children) {
    const found = firstProblemOf(child);
    if (found) return found;
  }
  return null;
}

function overviewMarkup() {
  const s = summarize(state.problems);
  const tree = buildTree(state.problems);
  return `<div class="overview view-enter">
    <div class="terminal-label"><span>~/2110252/digital-logic</span><span>overview.exe</span></div>
    <section class="overview-hero">
      <p class="command-line"><span>$</span> ./browse-problems --course 2110252</p>
      <h1>DIGITAL<br><span>LOGIC</span><i>_</i></h1>
      <p class="overview-copy">Browse course exercises, exam statements, circuit solutions rendered by the Digital simulator, and scratch-paper notes — all in one focused workspace.</p>
    </section>
    <section class="metric-grid" aria-label="Library summary">
      <article><span>01</span><strong>${s.problems}</strong><small>PROBLEMS INDEXED</small></article>
      <article><span>02</span><strong>${tree.length}</strong><small>TOPIC GROUPS</small></article>
      <article><span>03</span><strong>${s.pdfs}</strong><small>PDF STATEMENTS</small></article>
      <article><span>04</span><strong>${s.digs}</strong><small>DIG SOLUTIONS</small></article>
    </section>
    <section class="overview-grid">
      <div class="quick-start"><div class="panel-title"><span>QUICK_START.md</span><i></i></div><ol>
        <li><span>01</span><div><strong>Pick a group</strong><p>Expand a topic in the navigation tree.</p></div></li>
        <li><span>02</span><div><strong>Open a problem</strong><p>Read the statement, then switch to the circuit.</p></div></li>
        <li><span>03</span><div><strong>Study the solution</strong><p>Zoom the rendered circuit or download the .dig and simulate it yourself.</p></div></li>
      </ol></div>
      <div class="topic-terminal"><div class="panel-title"><span>topics.list</span><i></i></div><div class="terminal-body">
        ${tree.map((node, i) => {
          const first = firstProblemOf(node);
          return `<button type="button" ${first ? `data-goto="${encodeURIComponent(first.id)}"` : 'disabled'}><span>${String(i + 1).padStart(2, '0')}</span><strong>${escapeHtml(node.name)}</strong><small>${countTree(node)}</small></button>`;
        }).join('')}
        <p><span>$</span> select a topic to continue<span class="cursor">█</span></p>
      </div></div>
    </section>
  </div>`;
}

/* ---------- Problem view ---------- */

function emptyResource(kind, title, message) {
  return `<div class="empty-resource"><div class="empty-icon">${icon(kind)}</div><code>STATUS: NOT_FOUND</code><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p></div>`;
}

function toolbarLink(href, label, { primary = false, download = false } = {}) {
  return `<a ${download ? 'download' : 'target="_blank" rel="noopener"'} class="${primary ? 'primary' : ''}" href="${escapeHtml(href)}">${label}${icon(download ? 'download' : 'external')}</a>`;
}

function problemMarkup(p) {
  const ordered = state.problems;
  const index = ordered.findIndex((item) => item.id === p.id);
  const previous = index > 0 ? ordered[index - 1] : null;
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;
  return `<div class="problem-view view-enter">
    <h1 class="problem-title">${escapeHtml(p.title)}</h1>
    <div class="problem-meta">
      <code>${escapeHtml(p.id)}</code>
      <span class="meta-dot ${p.pdf ? 'ready' : ''}" title="PDF statement ${p.pdf ? 'available' : 'missing'}">PDF</span>
      <span class="meta-dot ${p.dig ? 'ready' : ''}" title=".dig solution ${p.dig ? 'available' : 'missing'}">DIG</span>
      <span class="meta-dot ${p.hasNote ? 'ready' : ''}" title="Scratch note ${p.hasNote ? 'available' : 'missing'}">NOTE</span>
    </div>
    <div class="tab-bar" role="tablist" aria-label="Problem resources">
      ${TABS.map((tab) => {
        const available = isTabAvailable(tab.id, p);
        return `<button role="tab" id="tab-${tab.id}" aria-controls="panel-${tab.id}" aria-selected="${tab.id === 'statement'}" tabindex="${tab.id === 'statement' ? 0 : -1}" data-tab="${tab.id}">${icon(tab.kind)}<span>${tab.label}</span><small>${available ? 'READY' : 'MISSING'}</small></button>`;
      }).join('')}
    </div>
    <div class="problem-body">
      <section class="tab-panel" id="panel-statement" role="tabpanel" aria-labelledby="tab-statement" tabindex="0">
        ${p.pdf ? `<div class="resource-toolbar"><span class="file-chip">${icon('file')}<code>${escapeHtml(basename(p.pdf))}</code></span><div class="actions">${toolbarLink(asset(p.pdf), 'OPEN')}${toolbarLink(asset(p.pdf), 'DOWNLOAD', { download: true })}</div></div><object class="pdf-viewer" data="${asset(p.pdf)}" type="application/pdf">${emptyResource('file', 'PDF preview unavailable', 'Open the statement in a new browser tab.')}</object>` : emptyResource('file', 'Statement unavailable', 'No PDF is associated with this problem yet.')}
      </section>
      <section class="tab-panel" id="panel-solution" role="tabpanel" aria-labelledby="tab-solution" tabindex="0" hidden>
        ${p.dig ? `<div class="resource-toolbar"><span class="file-chip">${icon('circuit')}<code>${escapeHtml(basename(p.dig))}</code></span><div class="actions">
            <div class="zoom-group"><button type="button" data-zoom="in" title="Zoom in">+</button><button type="button" data-zoom="out" title="Zoom out">−</button><button type="button" data-zoom="fit" title="Fit to view">FIT</button><button type="button" data-zoom="reset" title="Reset zoom">1:1</button></div>
            ${p.svg ? toolbarLink(asset(p.dig), 'DOWNLOAD .DIG', { primary: true, download: true }) : ''}
            ${p.svg ? toolbarLink(asset(p.svg), 'SVG', { download: true }) : ''}
          </div></div>
          <div id="solution-viewer">${p.svg ? '<div class="inline-loader"><span></span>RENDERING CIRCUIT...</div>' : emptyResource('zap', 'Circuit not rendered', 'Run npm run render to generate the SVG for this circuit.')}</div>`
        : emptyResource('circuit', 'Solution unavailable', 'No .dig circuit is associated with this problem yet.')}
      </section>
      <section class="tab-panel" id="panel-note" role="tabpanel" aria-labelledby="tab-note" tabindex="0" hidden>
        ${p.note ? `<div class="resource-toolbar"><span class="file-chip">${icon('note')}<code>${escapeHtml(basename(p.ods || p.csv))}</code></span><div class="actions">${toolbarLink(asset(p.note), 'OPEN')}${(p.ods || p.csv) ? toolbarLink(asset(p.ods || p.csv), 'DOWNLOAD', { download: true }) : ''}</div></div><div class="note-frame"><iframe src="${asset(p.note)}" title="Scratch note for ${escapeHtml(p.title)}"></iframe></div>` : emptyResource('note', 'No scratch note', 'This problem has no .ods or .csv scratch paper yet.')}
      </section>
    </div>
    <nav class="problem-pagination" aria-label="Adjacent problems">
      ${previous ? `<a href="#/problem/${encodeURIComponent(previous.id)}"><small>← PREVIOUS</small><strong>${escapeHtml(previous.title)}</strong><span>${escapeHtml(previous.groupPath.join(' / '))}</span></a>` : '<span></span>'}
      ${next ? `<a class="next" href="#/problem/${encodeURIComponent(next.id)}"><small>NEXT →</small><strong>${escapeHtml(next.title)}</strong><span>${escapeHtml(next.groupPath.join(' / '))}</span></a>` : '<span></span>'}
    </nav>
  </div>`;
}

async function loadSolution(p) {
  const container = document.querySelector('#solution-viewer');
  if (!container || !p.svg) return;
  const token = ++solutionToken;
  try {
    const response = await fetch(asset(p.svg));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (token !== solutionToken) return;
    container.innerHTML = '';
    state.viewer = createSvgViewer(container);
    state.viewer.load(text);
  } catch (error) {
    if (token !== solutionToken) return;
    container.innerHTML = emptyResource('circuit', 'Circuit could not be loaded', `SVG render failed: ${error.message}`);
  }
}

function selectTab(main, tabButton, { focus = false } = {}) {
  const selectedId = tabButton.dataset.tab;
  main.querySelectorAll('[role="tab"]').forEach((item) => {
    const selected = item === tabButton;
    item.setAttribute('aria-selected', String(selected));
    item.setAttribute('tabindex', selected ? '0' : '-1');
  });
  main.querySelectorAll('.tab-panel').forEach((panel) => { panel.hidden = panel.id !== `panel-${selectedId}`; });
  if (focus) tabButton.focus();
}

function bindProblemPage(p) {
  const main = document.querySelector('#main');
  const tabs = [...main.querySelectorAll('[role="tab"]')];

  const activate = (tab, options) => selectTab(main, tab, options);
  tabs.forEach((tab) => tab.addEventListener('click', () => activate(tab)));
  main.querySelector('.tab-bar').addEventListener('keydown', (event) => {
    const currentIndex = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    let target = null;
    if (event.key === 'ArrowRight') target = tabs[(currentIndex + 1) % tabs.length];
    else if (event.key === 'ArrowLeft') target = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
    else if (event.key === 'Home') target = tabs[0];
    else if (event.key === 'End') target = tabs[tabs.length - 1];
    if (target) { event.preventDefault(); activate(target, { focus: true }); }
  });

  main.querySelectorAll('[data-zoom]').forEach((button) => button.addEventListener('click', () => {
    if (!state.viewer) return;
    const action = button.dataset.zoom;
    if (action === 'in') state.viewer.zoomIn();
    else if (action === 'out') state.viewer.zoomOut();
    else if (action === 'fit') state.viewer.fit();
    else state.viewer.reset();
  }));
  main.querySelectorAll('[data-goto]').forEach((button) => button.addEventListener('click', () => {
    location.hash = `#/problem/${button.dataset.goto}`;
  }));
  if (p.dig && p.svg) loadSolution(p);
}

/* ---------- Routing ---------- */

function route() {
  if (state.viewer) { state.viewer.destroy(); state.viewer = null; }
  solutionToken++;
  const { page, problemId } = pageRoute(location.hash);
  const problem = problemId ? resolveProblemByIdOrAlias(state.problems, problemId) : null;
  const main = document.querySelector('#main');
  if (page === 'problem' && problem) {
    // Legacy alias routes resolve to their problem, then the URL is rewritten
    // to the canonical route without a reload.
    if (problemId !== problem.id) {
      history.replaceState(null, '', `#/problem/${encodeURIComponent(problem.id)}`);
    }
    document.title = `${problem.title} — 2110252 Digital Logic Atlas`;
    main.innerHTML = problemMarkup(problem);
    bindProblemPage(problem);
  } else {
    document.title = '2110252 Digital Logic Atlas';
    if (page === 'problem') location.hash = '#/';
    main.innerHTML = overviewMarkup();
    main.querySelectorAll('[data-goto]').forEach((button) => button.addEventListener('click', () => {
      location.hash = `#/problem/${button.dataset.goto}`;
    }));
  }
  renderSidebar();
  main.focus({ preventScroll: true });
  main.scrollTop = 0;
}

/* ---------- Shell events ---------- */

function bindShell() {
  document.querySelector('#menu-button').addEventListener('click', () => {
    if (state.sidebarOpen) closeSidebar(true);
    else openSidebar();
  });
  document.querySelector('.sidebar-scrim').addEventListener('click', () => closeSidebar());
  document.querySelector('.theme-button').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('digital-logic-theme', next); } catch (_) { /* private mode */ }
    document.querySelector('.theme-button').innerHTML = next === 'dark' ? icon('sun') : icon('moon');
  });

  const search = document.querySelector('#global-search');
  search.addEventListener('input', () => {
    state.query = search.value.trim();
    renderSidebar();
    // On mobile the tree lives in the drawer — surface results immediately.
    if (state.query && isMobile() && !state.sidebarOpen) openSidebar();
  });

  document.addEventListener('keydown', (event) => {
    const searchFocused = document.activeElement === search;
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) {
      event.preventDefault();
      search.focus();
    } else if (event.key === 'Escape') {
      if (searchFocused) { search.value = ''; state.query = ''; renderSidebar(); search.blur(); }
      else if (state.sidebarOpen) closeSidebar(true);
    }
  });
  window.addEventListener('hashchange', route);
}

/* ---------- Boot ---------- */

async function boot() {
  let response = null;
  try { response = await fetch(new URL('data/site.json', document.baseURI)); } catch (_) { /* network error */ }
  if (!response || !response.ok) {
    showFatal('data/site.json not found', 'The content manifest is missing. Run "npm run render && npm run build" to generate it, then reload.');
    return;
  }
  try { state.problems = await response.json(); } catch (_) {
    showFatal('data/site.json is invalid', 'The manifest could not be parsed. Rebuild the site with "npm run build".');
    return;
  }
  if (!Array.isArray(state.problems) || !state.problems.length) {
    showFatal('empty manifest', 'No problems were indexed. Add folders with .dig or .pdf files, then run "npm run index && npm run build".');
    return;
  }
  clearBootState();
  app.innerHTML = shellMarkup();
  bindShell();
  route();
}

boot();
