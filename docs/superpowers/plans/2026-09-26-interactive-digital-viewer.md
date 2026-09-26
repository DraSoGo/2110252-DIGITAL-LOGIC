# Reliable Interactive Digital Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every problem viewer use its available space reliably, render Digital circuits in IEEE style, and provide a safe full-screen browser launch of the real Digital application.

**Architecture:** Keep the SPA's PDF/SVG/Note viewers as the primary fast path, giving their flex/grid parents explicit shrink and growth rules. Add a separate `interactive.html` page whose small controller resolves only a canonical manifest problem ID, fetches its configured `.dig`, and starts the unmodified Digital JAR through a single CheerpJ session. Build-time scripts generate responsive notes, IEEE SVGs, and copy an allowlisted Digital runtime bundle into `dist`.

**Tech Stack:** Vanilla ES modules, Node.js 20+, node:test, Digital CLI/JAR, LibreOffice headless conversion, CheerpJ 4.3 CDN, Playwright browser tests.

**Spec:** `docs/superpowers/specs/2026-09-26-interactive-digital-viewer-design.md`

## Global Constraints

- Preserve `content/**/metadata.json` as the only source of problem resource paths; do not infer filenames at browser runtime.
- Keep `statement.pdf`, `solution.dig`, `note.ods`, and `note.csv` canonical naming and the existing config-driven scanner contract.
- Retain static SVG as the default solution preview; interactivity is an explicit separate-page launch.
- Use `document.baseURI` for all browser asset URLs; no root-relative content URLs.
- Launch only a manifest-resolved canonical problem ID; never use a query string as an arbitrary file URL.
- Start one CheerpJ JVM per interactive page and treat `/str/solution.dig` as read-only source input.
- Copy only allowlisted Digital runtime artifacts from `tools/Digital` into `dist/vendor/digital`; fail the build if required artifacts are absent.
- Keep Digital GPL attribution and CheerpJ runtime notice in published output.
- All production code begins only after a targeted failing test demonstrates its required behavior.

## Review Focus

- A legacy alias in `interactive.html?problem=` must be rejected rather than accidentally loading an unintended resource; Task 3 pins this.
- A GitHub Pages project subpath must resolve manifests, `.dig`, JAR, and fallback download links without `/`-root URLs; Tasks 3 and 6 pin this.
- A solution containing a large SVG must refit after panel resize without overriding a user's later pan/zoom; Task 2 pins this.
- An ODS table wider than a phone viewport must scroll inside its note document without widening the parent page; Task 4 pins this.
- A missing CDN/JAR/circuit must leave a usable interactive error screen and never degrade the SPA's static SVG preview; Task 3 pins this.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/styles.css` | Explicit viewport/flex sizing, compact controls, responsive viewer and interactive-page styles. |
| `src/app.js` | Adds the manifest-derived `OPEN INTERACTIVE` link while retaining current preview behavior. |
| `src/lib/svg-viewer.js` | Viewer resize and wheel behavior; no simulator behavior. |
| `src/lib/interactive-problem.js` | Pure canonical-ID validation and base-path-aware interactive URL helpers. |
| `src/lib/digital-runtime.js` | CheerpJ loader/session adapter with deterministic state transitions and injectable dependencies. |
| `interactive.html` | Full-page shell for the real Digital UI. |
| `src/interactive.js` | Interactive-page DOM orchestration and accessible fallback UI. |
| `scripts/render-svg.mjs` | Digital CLI IEEE SVG export. |
| `scripts/render-notes.mjs` | Responsive wrapper and stylesheet for ODS/CSV generated notes. |
| `scripts/lib/digital-bundle.mjs` | Allowlisted Digital artifact discovery/copying used by the build. |
| `scripts/build.mjs` | Copies interactive assets and required Digital bundle into `dist`. |
| `.github/workflows/pages.yml` | Installs Playwright Chromium and runs browser tests after production build. |
| `test/*.test.mjs` | Unit/build regressions. |
| `test/browser/*.spec.mjs` | Playwright layout and interactive fallback tests. |

### Task 1: Define test and browser-test foundations

**Files:**
- Modify: `package.json`
- Create: `playwright.config.mjs`
- Create: `test/browser/server.mjs`
- Create: `test/browser/layout.spec.mjs`
- Modify: `.github/workflows/pages.yml`

**Interfaces:**
- Produces `npm run test:browser`, which serves `dist` under a caller-provided base path and runs Playwright Chromium.
- Produces `playwright.config.mjs` with `testDir: 'test/browser'`, `fullyParallel: false`, and desktop/mobile projects.

- [ ] **Step 1: Write the failing browser test and script declaration**

Add `test/browser/layout.spec.mjs` with a first smoke assertion against the current built site:

```js
import { test, expect } from '@playwright/test';

test('problem page has no horizontal document overflow', async ({ page }) => {
  await page.goto('/#/problem/simulation%2Flab-01%2F01');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
```

Add this deliberately unavailable script to `package.json`:

```json
"test:browser": "playwright test"
```

- [ ] **Step 2: Run the failing browser command**

Run: `npm run test:browser`

Expected: FAIL because Playwright/configuration has not been installed or configured.

- [ ] **Step 3: Add the minimal test harness**

Install `@playwright/test` as a dev dependency. Create `playwright.config.mjs` that starts `node test/browser/server.mjs dist` on a fixed localhost port and uses `baseURL`. Implement `test/browser/server.mjs` as a static server that maps `/2110252-DIGITAL-LOGIC/...` to `dist/...`, sets static MIME types, prevents `..` traversal, and falls back to `index.html` only for SPA routes. Add a CI step after `npm run tools`:

```yaml
- name: Install browser test runtime
  run: npx playwright install --with-deps chromium
```

Then run `npm run build && npm run test:browser` locally after installing Chromium.

- [ ] **Step 4: Verify the harness passes and run the existing unit suite**

Run: `npm run build && npm run test:browser && npm test`

Expected: browser smoke and existing node:test suite PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json playwright.config.mjs test/browser .github/workflows/pages.yml
git commit -m "test: add browser regression harness"
```

### Task 2: Fix viewer layout and compact controls

**Files:**
- Modify: `src/styles.css`
- Modify: `src/lib/svg-viewer.js`
- Modify: `test/browser/layout.spec.mjs`
- Modify: `test/ui.test.mjs`

**Interfaces:**
- Consumes: `createSvgViewer(container)`.
- Produces: `createSvgViewer(container).fit()` that recalculates from the viewport after resize while preserving user interaction.
- Produces: CSS custom layout in which `.problem-body`, active `.tab-panel`, `#solution-viewer`, `.svg-frame`, and `.note-frame` can all shrink and grow without percentage-height ambiguity.

- [ ] **Step 1: Write failing layout tests**

Add desktop and mobile assertions that select each resource tab and compare rectangles:

```js
const geometry = await page.evaluate(() => {
  const panel = document.querySelector('.tab-panel:not([hidden])').getBoundingClientRect();
  const iframe = document.querySelector('.note-frame iframe')?.getBoundingClientRect();
  return { panel, iframe, width: document.documentElement.scrollWidth, viewport: innerWidth };
});
expect(geometry.iframe.height).toBeGreaterThan(300);
expect(Math.abs(geometry.panel.bottom - geometry.iframe.bottom)).toBeLessThanOrEqual(2);
expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
```

Also assert `tab-bar` height is at most 40 px at desktop width and that the previous/next bar does not overlap the active panel. Add a unit-source assertion that wheel prevention is conditional on a modifier key or explicit viewer focus mode.

- [ ] **Step 2: Run tests to verify the current regressions fail**

Run: `npm run build && npm run test:browser -- --grep "viewer fills|compact tabs|no overlap" && npm test -- --test-name-pattern="wheel"`

Expected: FAIL on the current 52 px tabs and Note/SVG sizing assertions.

- [ ] **Step 3: Implement the smallest layout correction**

In `src/styles.css`, use `height: 100%` only where the containing block has a definite size; otherwise use `flex: 1 1 auto; min-height: 0`. Make `.problem-view` a bounded full-height column on desktop, make `.problem-body` and `#solution-viewer` explicit `min-height: 0` flex children, replace `.svg-frame { display:grid }` with a shrink-safe flex container, and set `.note-frame iframe { flex: 1 1 auto; min-height: 0; height:auto }`. Set tab buttons to 40 px desktop height and resource action controls to 32 px minimum height. Preserve the mobile 320 px viewer minimum and remove page-level horizontal overflow.

In `src/lib/svg-viewer.js`, track `userInteracted` before resize handling, call `fit()` only before first interaction, and prevent wheel default only when the pointer is inside the viewer and the user holds Ctrl/Meta. Keep drag pan and toolbar zoom unchanged.

- [ ] **Step 4: Verify the targeted and full tests**

Run: `npm run build && npm run test:browser && npm test`

Expected: PASS; browser screenshots/measurements show full-height iframe/SVG and no overlap.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css src/lib/svg-viewer.js test/browser/layout.spec.mjs test/ui.test.mjs
git commit -m "fix: make problem viewers fill their panels"
```

### Task 3: Add a safe interactive Digital launcher

**Files:**
- Create: `src/lib/interactive-problem.js`
- Create: `src/lib/digital-runtime.js`
- Create: `src/interactive.js`
- Create: `interactive.html`
- Modify: `src/app.js`
- Modify: `src/styles.css`
- Create: `test/interactive-problem.test.mjs`
- Create: `test/digital-runtime.test.mjs`
- Modify: `test/browser/layout.spec.mjs`

**Interfaces:**
- `resolveInteractiveProblem(problems, search): { problem, error }`, where `problem` is only a canonical record with `dig` or `null`.
- `interactivePageHref(id): string`, returning `interactive.html?problem=${encodeURIComponent(id)}` relative to `document.baseURI`.
- `createDigitalRuntime({ loadScript, fetchBytes, cheerpj, documentBase }): { start(problem): Promise<void>, state(): string }`.
- `start(problem)` fetches `problem.dig`, writes `/str/solution.dig`, creates display, and calls `cheerpjRunJar('/app/vendor/digital/Digital.jar', '/str/solution.dig')` exactly once.

- [ ] **Step 1: Write failing resolver and runtime tests**

Create resolver tests for a valid canonical ID, a legacy alias, missing query, unknown ID, and a problem without `dig`:

```js
assert.deepEqual(resolveInteractiveProblem(problems, '?problem=simulation%2Flab-01%2F01').problem.id, 'simulation/lab-01/01');
assert.equal(resolveInteractiveProblem(problems, '?problem=Simulation%2FLab_01%2F01').problem, null);
```

Create runtime tests using injected fakes that record calls. Assert the ordered calls include `loadScript`, `cheerpjInit({ version: 11, overrideDocumentBase })`, `cheerpOSAddStringFile('/str/solution.dig', bytes)`, and one `cheerpjRunJar`. Assert retrying `start` after ready does not run the JAR again; assert a fetch rejection sets `failed` and retains its error.

- [ ] **Step 2: Run the new tests to confirm they fail for missing modules**

Run: `node --test test/interactive-problem.test.mjs test/digital-runtime.test.mjs`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement pure resolution and runtime adapter**

Implement `resolveInteractiveProblem` with `new URLSearchParams(search)`, exact canonical-ID equality, and explicit errors: `missing-problem`, `unknown-problem`, and `missing-solution`. Implement `interactivePageHref` with `new URL('interactive.html', document.baseURI)` and set its `problem` search parameter.

Implement `createDigitalRuntime` with a state variable and injected collaborators. Its `start` validates `problem.dig`, loads `https://cjrtnc.leaningtech.com/4.3/loader.js` once, initializes Java 11 once, fetches bytes with `fetchBytes(new URL(problem.dig, document.baseURI))`, calls `cheerpOSAddStringFile('/str/solution.dig', bytes)`, creates a display inside the supplied host, then runs the JAR once. Convert all thrown errors to `failed` state and rethrow the original error.

Implement `interactive.html` with status region, return link, source-download link, display host, and module script. Implement `src/interactive.js` to fetch `data/site.json`, resolve the problem, update document title and links, invoke the runtime, and render retry/download/back fallback controls. Do not write HTML from query input.

In `src/app.js`, add a primary `OPEN INTERACTIVE` link only where `p.dig` exists, with `target="_blank" rel="noopener"`, using `interactivePageHref(p.id)`.

- [ ] **Step 4: Add failing then passing browser fallback test**

First intercept the CheerpJ loader request in Playwright and force it to fail; assert `/interactive.html?problem=...` shows `DOWNLOAD SOURCE .DIG` and `RETURN TO PROBLEM`, and does not navigate the SPA tab. Then add a subpath test visiting `/2110252-DIGITAL-LOGIC/interactive.html?problem=...` and assert the source link includes that subpath.

Run: `npm test && npm run build && npm run test:browser`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/interactive-problem.js src/lib/digital-runtime.js src/interactive.js interactive.html src/app.js src/styles.css test/interactive-problem.test.mjs test/digital-runtime.test.mjs test/browser/layout.spec.mjs
git commit -m "feat: launch Digital interactively in a separate page"
```

### Task 4: Generate responsive notes and IEEE SVG previews

**Files:**
- Modify: `scripts/render-notes.mjs`
- Modify: `scripts/render-svg.mjs`
- Create: `test/renderers.test.mjs`

**Interfaces:**
- `wrapNoteDocument(html, title): string` produces valid standalone responsive note HTML.
- `buildSvgArgs(source, output): string[]` returns `['-dig', source, '-svg', output, '-ieee']`.

- [ ] **Step 1: Write failing renderer tests**

Export the two pure helpers and test them directly:

```js
assert.match(wrapNoteDocument('<table style="width: 20cm"><tr><td>x</td></tr></table>', 'Note'), /class="note-table-scroll"/);
assert.match(wrapNoteDocument('<img src="x.png">', 'Note'), /max-width: 100%/);
assert.deepEqual(buildSvgArgs('/tmp/a.dig', '/tmp/a.svg'), ['-dig', '/tmp/a.dig', '-svg', '/tmp/a.svg', '-ieee']);
```

- [ ] **Step 2: Run tests and observe missing exports/failing behavior**

Run: `node --test test/renderers.test.mjs`

Expected: FAIL because helpers and IEEE flag do not exist.

- [ ] **Step 3: Implement the generator changes**

Refactor `scripts/render-notes.mjs` so both ODS and CSV output pass through `wrapNoteDocument`. It must insert a viewport meta tag, `.note-document` root, `box-sizing: border-box`, media `max-width:100%`, and a `.note-table-scroll { overflow-x:auto }` wrapper around every table. Preserve embedded-data image URLs from LibreOffice.

Refactor `scripts/render-svg.mjs` to call `runJava(buildSvgArgs(source, output))`, adding `-ieee` as a boolean trailing CLI option. Keep source/output paths and existing error aggregation unchanged.

- [ ] **Step 4: Build and inspect generated artifacts**

Run: `node --test test/renderers.test.mjs && npm run render && npm test`

Expected: PASS; generated note HTML has the responsive wrapper and generated SVGs contain IEEE/ANSI-rendered gate paths.

- [ ] **Step 5: Commit**

```bash
git add scripts/render-notes.mjs scripts/render-svg.mjs test/renderers.test.mjs generated
git commit -m "fix: render responsive notes and IEEE circuit previews"
```

### Task 5: Copy the Digital browser bundle with attribution

**Files:**
- Create: `scripts/lib/digital-bundle.mjs`
- Modify: `scripts/build.mjs`
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `test/digital-bundle.test.mjs`

**Interfaces:**
- `digitalBundleEntries(root): Promise<string[]>` returns normalized allowlisted relative paths required by Digital's manifest.
- `copyDigitalBundle(root, dist): Promise<number>` copies only `Digital.jar`, JAR dependencies named by its manifest `Class-Path`, and `THIRD_PARTY_NOTICES.md`.

- [ ] **Step 1: Write failing bundle tests using a temporary Digital release fixture**

Create a fixture `tools/Digital/Digital.jar` as a minimal ZIP/JAR manifest containing:

```text
Manifest-Version: 1.0
Class-Path: lib/xstream.jar lib/commons.jar
```

Add those JAR fixture files plus an unrelated `README.txt`. Assert the copied `dist/vendor/digital` contains the main/dependency JARs but not `README.txt`, and that a missing dependency rejects with its relative name.

- [ ] **Step 2: Run the test to verify missing module failure**

Run: `node --test test/digital-bundle.test.mjs`

Expected: FAIL because `scripts/lib/digital-bundle.mjs` is absent.

- [ ] **Step 3: Implement allowlisted bundle discovery**

Read `META-INF/MANIFEST.MF` from `Digital.jar` with `unzip -p <jar> META-INF/MANIFEST.MF`, using the same command in the temporary fixture test. Parse folded `Class-Path` lines, reject absolute paths and `..` segments, verify each dependency exists beneath `tools/Digital`, and copy it into `dist/vendor/digital` preserving its relative path. Copy `THIRD_PARTY_NOTICES.md` to `dist/vendor/digital/NOTICE.md`.

Update `scripts/build.mjs` to call `copyDigitalBundle(root, dist)` after static assets are copied. The production build must fail before writing a deceptively complete `dist` when the local Digital tool is unavailable.

Write `THIRD_PARTY_NOTICES.md` with Digital's project URL/GPL-3.0 attribution and a concise CheerpJ CDN/runtime notice, including the user-facing source/save limitation.

- [ ] **Step 4: Verify the bundle and the complete build**

Run: `node --test test/digital-bundle.test.mjs && npm run tools && npm run build && npm test`

Expected: PASS; `dist/vendor/digital/Digital.jar`, its manifest dependencies, and `NOTICE.md` exist.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/digital-bundle.mjs scripts/build.mjs THIRD_PARTY_NOTICES.md test/digital-bundle.test.mjs
git commit -m "build: publish Digital runtime bundle with notices"
```

### Task 6: Complete browser coverage and production verification

**Files:**
- Modify: `test/browser/layout.spec.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes the finished SPA, generated notes/SVGs, and interactive page.
- Produces documented local commands for `npm run tools`, `npm run build`, `npm test`, and `npm run test:browser`, plus Interactive Digital behavior/save limitations.

- [ ] **Step 1: Write final failing acceptance tests**

Add tests for Statement/Solution/Note at 1920×1080, 1366×768, and 390 px; assert tab height ≤40 px desktop, frame height fills its panel, no global horizontal overflow, local table overflow, keyboard tab navigation, `FIT` after viewport resize, manifest-resolved interactive link, and mocked CheerpJ failure fallback under both root and project subpath.

- [ ] **Step 2: Run the acceptance subset before final adjustments**

Run: `npm run build && npm run test:browser -- --grep "acceptance|interactive|resize|keyboard"`

Expected: FAIL only for any unimplemented acceptance criterion; record each exact failure before changing code.

- [ ] **Step 3: Make the smallest corrective changes**

Adjust only production code implicated by an observed assertion. Keep interactive runtime mocked in CI; do not replace it with a fake interactive SVG. Update `README.md` with launch instructions, CheerpJ network requirement, `Save As` behavior, and download fallback.

- [ ] **Step 4: Run the full verification matrix**

Run: `npm run tools && npm run verify && npm run test:browser`

Expected: build, node:test, lint/content audit, and Playwright suites PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md test/browser/layout.spec.mjs src scripts
git commit -m "test: verify interactive viewer release criteria"
```

### Task 7: Fresh branch review, pull request, and deployment verification

**Files:**
- No product files expected unless review finds an issue.

**Interfaces:**
- Consumes: the complete branch, plan, spec, test evidence, and GitHub Actions checks.
- Produces: reviewed pull request to `main` and deployed GitHub Pages smoke-test evidence.

- [ ] **Step 1: Build a whole-branch review package**

Run the implementation workflow's review-package script against `git merge-base main HEAD` and include the spec, plan, browser tests, runtime adapter, build bundle, and review-focus cases.

- [ ] **Step 2: Run a fresh whole-branch review**

Ask a fresh reviewer to assess the package for correctness, security, accessibility, GitHub Pages subpath behavior, dependency/license risks, and test gaps. Classify findings Critical, Important, or Minor.

- [ ] **Step 3: Fix Critical/Important findings with red-green evidence**

For each accepted finding, add a failing targeted test, run it, implement the smallest correction, rerun the targeted test and `npm run verify`, then commit using a focused Conventional Commit message.

- [ ] **Step 4: Create the pull request and wait for CI evidence**

Push `codex/interactive-digital-viewer`, open a PR to `main`, and confirm the Pages workflow's build/test/audit jobs pass. Do not merge until checks pass.

- [ ] **Step 5: Merge and smoke-test deployment**

Merge only after the user-approved PR is green. Confirm the deployed project-subpath site: one PDF, one ODS note, one IEEE SVG, and one actual Digital interactive launch with an input toggle. Record any CheerpJ CDN limitation separately from application defects.

## Plan Self-review

- **Spec coverage:** Task 2 covers layout, compact tabs, scroll ownership, SVG resize/wheel behavior, and responsive sizing. Task 3 covers canonical resolution, full-screen CheerpJ launch, fallback, save limitation, accessibility, and subpath URLs. Task 4 covers ODS/CSV responsiveness and IEEE export. Task 5 covers JAR dependencies, build copying, notices, and build failure. Tasks 1 and 6 cover browser tests and CI. Task 7 covers review/PR/deploy.
- **Placeholder scan:** No unresolved implementation markers or generic test directives remain; every implementation task names exact files, functions, and verification commands.
- **Type consistency:** `resolveInteractiveProblem`, `interactivePageHref`, and `createDigitalRuntime` are introduced in Task 3 and only consumed under those names later. `buildSvgArgs`, `wrapNoteDocument`, `digitalBundleEntries`, and `copyDigitalBundle` are introduced before their test/build consumers.
- **Review focus coverage:** Canonical alias rejection and runtime failure are Task 3 tests; subpath behavior is Tasks 3 and 6; resize behavior is Task 2; narrow table behavior is Task 4.
