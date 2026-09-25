# Viewer Reliability and Interactive Digital Design

**Date:** 2026-09-26  
**Status:** Proposed for implementation  
**Scope:** Fix the problem viewer layout and add an optional, real Digital simulator experience without changing the config-driven content model.

## Context

The site already discovers problems from `content/**/metadata.json` and displays three resources per problem: statement, solution, and note. The current production viewer has several visible regressions:

- the problem header, three resource tabs, and toolbars consume too much vertical space;
- the Note iframe renders at about 150 px high even when its panel has much more room;
- the SVG solution viewport does not fill its available panel and can be clipped by surrounding navigation;
- some note tables are fixed-width LibreOffice HTML and overflow at narrower widths;
- generated circuit SVGs use IEC-style boxes (`&`, `≥1`) rather than the IEEE/ANSI gate shapes shown by the Digital desktop application;
- the solution is only a static SVG, so inputs, clocks, and circuit state cannot be manipulated in the browser.

The content migration and naming convention remain authoritative: each problem owns its config and may point to `statement.pdf`, `solution.dig`, and a single supported note resource. Adding a valid problem folder and config must continue to require no application-code change.

## Goals

1. Make Statement, Solution, and Note use the full remaining viewport without being covered by headers, tabs, navigation, or adjacent panels.
2. Reduce the three resource tabs and their metadata/tool rows to a compact, consistent height.
3. Make generated solution previews resemble Digital's IEEE/ANSI display.
4. Keep SVG preview fast and dependency-free at runtime.
5. Add an explicit `OPEN INTERACTIVE` action that launches the actual Digital desktop application in a browser page using CheerpJ.
6. Preserve the config-driven content workflow and GitHub Pages deployment.
7. Add repeatable unit, build, and browser-layout regression tests.

## Non-goals

- Reimplementing the Digital simulator in JavaScript.
- Modifying or maintaining a fork of Digital.
- Embedding a long-lived JVM inside the single-page problem browser.
- Real-time multi-user editing, cloud saves, or server-side simulation.
- Changing the migrated problem/config directory contract.

## Architecture

### 1. Compact, viewport-owned problem layout

The application shell remains a fixed-height viewport on desktop, but each layer receives an explicit sizing responsibility:

- the global header owns its fixed height;
- the sidebar owns its own vertical scroll;
- the main problem column is a `minmax(0, 1fr)` grid/flex region;
- the problem resource panel receives all remaining height;
- only the active viewer's internal content scrolls;
- previous/next navigation stays outside the viewer and remains visible without overlaying it.

Every intermediate flex/grid child that must shrink gets `min-height: 0` and `min-width: 0`. Percentage heights are removed where the containing block is ambiguous. The Note iframe and SVG viewport use flex growth (`flex: 1 1 auto`) instead of relying on `height: 100%` inside mixed flex/grid containers.

The three resource tabs become a single compact row, targeted at 36–40 px on desktop rather than the current 52 px. The selected resource's filename and actions become a compact 32–36 px row. Controls retain at least a 32 px pointer target, visible focus styles, and meaningful labels.

On narrow screens, the page switches from a fixed two-column shell to normal document flow: sidebar becomes an off-canvas or collapsible navigation surface, the content column owns the width, and viewers receive a useful minimum height. There must be no horizontal page overflow; wide document content scrolls inside its viewer.

### 2. Statement viewer

The existing browser PDF viewer stays in place. Its container participates in the same height contract as the other resources. The PDF iframe/object fills the viewer region, while open/download actions stay in the compact metadata row.

The implementation must not attempt to restyle browser-native PDF controls. Tests cover only the site's container sizing and absence of page-level overflow.

### 3. Static SVG solution preview

The current pan/zoom SVG remains the default Solution view because it loads quickly and works without downloading a JVM. The solution panel receives a predictable structure:

1. compact resource metadata/actions;
2. compact zoom toolbar;
3. one flex-growing SVG viewport;
4. optional small status/zoom indicator inside the viewport.

Mouse-wheel handling consumes the event only while performing solution zoom. Normal page/sidebar scrolling remains unaffected outside the SVG viewport. `FIT` must calculate against the actual viewport after resize, tab activation, and asset load. A `ResizeObserver` triggers a refit only when required and must not create a resize loop.

The build-time Digital export command adds Digital CLI's boolean `-ieee` option. This preserves the circuit logic but renders familiar curved/standard gate symbols instead of IEC rectangles. The export script fails with a useful file-specific error if Digital cannot parse or render a circuit.

### 4. Responsive Note rendering

ODS notes continue to be converted at build time, but the generated document is normalized before publication:

- wrap the converted fragment in a stable `.note-document` root;
- remove or override fixed page widths that cause whole-page overflow;
- apply `max-width: 100%` to images and embedded objects;
- wrap wide tables in a horizontally scrollable region;
- keep table cells readable and preserve intentional whitespace where possible;
- add a viewport declaration and a small, self-contained responsive stylesheet.

The site iframe then fills the Note panel. Scrolling belongs to the note document, not a 150 px iframe inside an otherwise empty panel. The iframe keeps a descriptive title and uses the narrowest sandbox permissions compatible with generated static HTML.

### 5. Full-screen interactive Digital page

`OPEN INTERACTIVE` is a separate Solution action, distinct from `DOWNLOAD .DIG`. It opens a dedicated `interactive.html?problem=<canonical-id>` page in a new tab. A dedicated page is intentional: it gives the Swing canvas the entire viewport, isolates one CheerpJ JVM per tab, and avoids JVM lifecycle/z-index conflicts in the single-page browser.

The interactive page:

- loads the generated `data/site.json` manifest;
- resolves the requested canonical problem ID from the manifest rather than accepting an arbitrary asset URL;
- confirms that the problem has a `.dig` solution;
- shows a lightweight loading screen with the problem title and progress/status text;
- dynamically loads the official CheerpJ 4.3 loader from Leaning Technologies;
- initializes CheerpJ with Java 11 and the document base configured for the GitHub Pages project path;
- fetches the selected `.dig` through the same base-path-aware asset helper used by the main site;
- places its bytes into CheerpJ's `/str/solution.dig` virtual file;
- creates a responsive display that fills the remaining viewport;
- runs the unmodified Digital JAR with `/str/solution.dig` as its startup argument.

The runtime controller is a small module with explicit states: `idle`, `loading-runtime`, `loading-circuit`, `starting`, `ready`, and `failed`. Initialization is single-shot per page. Duplicate clicks or repeated initialization cannot start multiple JVMs.

The source loaded from `/str` is treated as read-only. The page explains that users should use Digital's **Save As** into CheerpJ's `/files/downloads` area when they want an edited file, and it always retains a direct `DOWNLOAD SOURCE .DIG` fallback. No claim is made that browser edits overwrite repository files.

If the CDN, JVM, JAR, manifest, or circuit fails to load, the page keeps a usable error panel with retry, source download, and return-to-problem actions. The static SVG preview in the main site remains fully usable when CheerpJ is unavailable.

### 6. Build and deployment

The build creates these additional public assets:

- `interactive.html` and its source modules;
- `vendor/digital/Digital.jar`;
- the JAR dependencies referenced by Digital's manifest, copied from the release fetched by `npm run tools`;
- a license/attribution file for Digital and a short notice explaining the externally hosted CheerpJ runtime.

The copy step uses an allowlist (JARs plus required license/version files), never the whole tools directory. Missing runtime artifacts fail the production build with an actionable message. Existing GitHub Actions already fetches Digital before building; local contributors use `npm run tools` when those ignored artifacts are absent.

All generated URLs use `document.baseURI` or the existing asset helper so `/2110252-DIGITAL-LOGIC/` and localhost behave identically. No root-relative `/content/...` paths are introduced.

## Data Flow

### Static preview

`metadata.json` → manifest scanner → `data/site.json` → problem router → generated IEEE SVG → pan/zoom viewer.

### Interactive launch

Problem Solution tab → `interactive.html?problem=<id>` → validate ID against `site.json` → fetch configured `.dig` → copy bytes to `/str/solution.dig` → `cheerpjRunJar(Digital.jar, /str/solution.dig)` → Swing UI in responsive display.

The `.dig` asset path still comes solely from the problem config and generated manifest. The interactive page does not infer filenames or scan directories at runtime.

## Security, licensing, and accessibility

- Query parameters are identifiers only; asset paths are resolved from the generated manifest.
- External runtime loading is restricted to the documented CheerpJ CDN endpoint.
- Digital is distributed under GPL-3.0; the deployed copy includes its applicable notice/source link. The repository's GPL-3.0 license remains unchanged.
- CheerpJ is an external runtime dependency governed by Leaning Technologies' current licensing terms. The implementation uses the documented Community/FOSS delivery model and does not vendor or modify the CheerpJ runtime.
- Toolbar buttons use real buttons/links, accessible names, keyboard focus, disabled states, and status text announced through an `aria-live` region.
- The interactive canvas does not silently trap the user: the page shell retains a keyboard-focusable return link and source-download link.

## Testing Strategy

### Unit and build tests

- manifest lookup accepts known canonical IDs and rejects missing/malformed IDs;
- the interactive controller transitions deterministically and starts at most one JVM;
- circuit bytes are written to the expected virtual path and passed to the JAR startup command;
- runtime, fetch, and Java-start errors reach the `failed` state with a fallback action;
- SVG rendering invokes Digital with the `-ieee` boolean flag;
- generated note HTML contains the responsive wrapper/style and protects wide tables/media;
- production build copies the interactive page, Digital JAR dependencies, and license notice;
- project audit rejects an interactive asset path that escapes the allowed generated/content/vendor roots.

### Browser regression tests

Add Playwright browser tests against a production build served under both `/` and a simulated project subpath. At desktop and mobile widths they assert:

- global header, sidebar, problem panel, and previous/next navigation do not overlap;
- resource tabs and metadata toolbar meet the compact-height target;
- Statement, SVG Solution, and Note iframe fill the available viewer region;
- wide notes scroll inside the iframe and do not widen the page;
- SVG `FIT` responds to a viewport resize and the toolbar remains visible;
- keyboard focus can reach all resource tabs and actions;
- the interactive page resolves a valid problem under a subpath and exposes a useful fallback on mocked runtime failure.

CI does not download/start the full CheerpJ JVM for every pull request. Controller behavior is tested with injected runtime adapters, while a manual release smoke test exercises the real CDN and Digital JAR.

## Acceptance Criteria

1. At 1920×1080 and 1366×768, no viewer content is covered by the global header, resource tabs, metadata row, or previous/next bar.
2. The active resource viewer occupies the remaining problem-panel height; the Note iframe is no longer fixed near 150 px.
3. The three resource tabs are no taller than 40 px on desktop, while interactive targets remain usable by keyboard and pointer.
4. At a 390 px viewport width there is no page-level horizontal scroll; wide note tables scroll locally.
5. Generated circuit previews use IEEE/ANSI gate shapes and all repository circuits still render successfully.
6. Every problem with a configured `.dig` exposes `OPEN INTERACTIVE`; problems without one do not.
7. Launching a valid circuit opens Digital in a full-screen browser page and permits normal simulator interaction (such as toggling inputs) through Digital's own UI.
8. A CheerpJ/runtime failure never breaks the main problem page and still offers source download.
9. The feature works from localhost and the GitHub Pages project subpath.
10. Existing manifest/content tests plus new unit, build, and browser tests pass in CI.

## Alternatives Considered

### Rebuild Digital in JavaScript

Rejected because faithfully reproducing Digital's component library, event model, file format, and simulation semantics would become a second simulator and a long-term maintenance burden.

### Convert every circuit to a custom interactive SVG

Rejected for the same semantic-risk reason. The current SVG is intentionally retained as a preview, not presented as a simulator.

### Run Digital on a backend and stream it

Rejected because the site is static GitHub Pages; adding a stateful remote desktop/backend substantially increases cost, latency, security surface, and operations.

### Embed CheerpJ inside the existing Solution panel

Rejected for the first implementation because a long-lived Swing/JVM surface conflicts with SPA navigation, consumes valuable vertical space, and complicates restarting with another circuit. The dedicated page is simpler, more reliable, and gives Digital the space its desktop UI expects.

## Rollout

Implementation occurs on `codex/interactive-digital-viewer`. After local verification, open a pull request to `main`, run the full GitHub Actions test/build job, review the production artifact size and licensing notices, and merge only after checks pass. After Pages deploys, manually smoke-test one small circuit, one large circuit, one ODS note, and one PDF on desktop and mobile widths. The static preview remains the rollback-safe default even if interactive runtime loading is disabled later.

## References

- Digital source and GPL-3.0 license: <https://github.com/hneemann/Digital>
- CheerpJ `cheerpjRunJar`: <https://cheerpj.com/docs/reference/cheerpjRunJar.html>
- CheerpJ virtual filesystem: <https://cheerpj.com/docs/explanation/File-System-support.html>
- CheerpJ responsive display: <https://cheerpj.com/docs/reference/cheerpjCreateDisplay.html>
- CheerpJ initialization: <https://cheerpj.com/docs/reference/cheerpjInit>
- CheerpJ licensing: <https://cheerpj.com/licensing/>
