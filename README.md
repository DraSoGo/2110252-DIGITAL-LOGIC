# 2110252 Digital Logic Atlas

A static web library for Digital Logic (2110252) problems: statements, circuit solutions, and scratch-paper notes in one predictable place. Each problem is a folder; the site builds itself from the folder tree.

Live site: `https://drasogo.github.io/2110252-DIGITAL-LOGIC/`

## How it works

- **Folder = problem (auto-detected).** A folder anywhere under the content tree is a problem when it directly contains a `.dig` or `.pdf` file. Every folder above it becomes a navigation group. Nest as deep as you like — the sidebar follows.
- **Solutions are rendered as SVG** at build time by the real [Digital](https://github.com/hneemann/Digital) simulator (headless CLI), so what you see is exactly what the circuit looks like in the app. The `.dig` file is downloadable from every solution view.
- **Scratch-paper notes (`.ods`)** are converted to self-contained HTML (tables + embedded drawings) at build time via LibreOffice headless. `.csv` files render as tables too.

## Content format

```
Exam1/                        # group (no .dig/.pdf directly inside)
└── 67/                       # group
    └── 01/                   # problem folder (has .dig/.pdf)
        ├── DigLo67_...pdf    # statement  (first .pdf found)
        ├── DigLo67_...dig    # solution   (first .dig found)
        └── ...ods or .csv    # note       (first .ods or .csv found, optional)
```

File names inside a problem folder are flexible — the first file of each type (natural sort) is picked automatically. `desktop.ini` and LibreOffice lock files are ignored.

## Add a problem

1. Create a new folder anywhere in the tree (e.g. `Exam2/68/05/`).
2. Drop in the statement PDF, the solution `.dig`, and optionally an `.ods`/`.csv` note.
3. Commit and push. CI re-indexes, re-renders, and deploys.

That's the whole workflow.

## Technology

No runtime framework, no backend, no npm dependencies. Semantic HTML + CSS + browser JavaScript modules, Node.js build scripts, [Digital](https://github.com/hneemann/Digital) CLI for SVG export, LibreOffice for ODS conversion. Hash-based routing works on GitHub Pages without server rewrites.

## Local development

Requires Node.js 20+, Java 11+ (for Digital), and LibreOffice (for ODS notes).

```bash
npm run tools     # one-time: download Digital simulator (~12 MB)
npm run render    # render .dig → SVG, .ods/.csv → HTML (cached by mtime)
npm run dev       # serve at http://localhost:4173
```

Full verification and production build:

```bash
npm run verify    # test + lint + build
npm run dev -- --dist   # preview the built site
```

## Folder structure

```
.
├── Exam1/ Simulation/ Learn/   # content trees (problems live here)
├── data/                # generated manifest (problems.json, site.json)
├── generated/           # rendered SVG + note HTML (gitignored)
├── tools/               # Digital simulator (gitignored)
├── scripts/             # index, render, build, serve, checks
├── src/                 # browser app (app.js, styles.css, lib/)
├── test/                # node:test suite
└── dist/                # production build output (gitignored)
```

## GitHub Pages

Settings → Pages → Source: **GitHub Actions**. Push to `main` runs tests, audits content, renders all circuits and notes, builds `dist/`, and deploys.

## License

Course content © respective authors. Site code available for personal study use.
