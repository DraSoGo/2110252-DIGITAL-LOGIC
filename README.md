# 2110252 Digital Logic Atlas

A static web library for Digital Logic (2110252) problems: statements, circuit solutions, and scratch-paper notes in one predictable place. The site is **config-driven** — all content lives under `content/` and is described by small JSON configs. Adding a group or a problem never touches application code.

Live site: `https://drasogo.github.io/2110252-DIGITAL-LOGIC/`

## How it works

- **`content/` is the single content root.** A folder is a **problem** when it contains `metadata.json`; every folder above it is a **group** described by `group.json`. Nest as deep as you like.
- **Solutions render as SVG** at build time using the real [Digital](https://github.com/hneemann/Digital) simulator (headless CLI). The `.dig` file is downloadable from every solution view.
- **Scratch notes** (`.ods`) convert to self-contained HTML via LibreOffice headless; `.csv` notes render as tables.
- **Identity comes from config, not folder names.** IDs, titles and ordering are read from `metadata.json` / `group.json`; renaming a folder does not change what the site shows.
- **Old URLs keep working** via `aliases` — a legacy link resolves to its problem and the URL is rewritten to the canonical route without a reload.

## Content layout

```
content/
├── exam-1/                     # group (has group.json)
│   ├── group.json
│   └── 66/                     # nested group
│       ├── group.json
│       └── 01/                 # problem (has metadata.json)
│           ├── metadata.json
│           ├── statement.pdf   # PDF statement      (optional, ≥1 of pdf/dig required)
│           ├── solution.dig    # Digital circuit    (optional)
│           └── note.ods        # scratch note       (optional, ods XOR csv)
└── learn/
    ├── group.json
    └── full-address-1/
        ├── metadata.json
        ├── solution.dig
        └── note.csv
```

Folder names are storage locations only — use lowercase kebab-case (`exam-1`, `lab-01`, `full-address-1`). Purely numeric folders (`66`, `01`) stay as-is.

### Canonical resource names

| File | Meaning |
|---|---|
| `statement.pdf` | the problem statement PDF |
| `solution.dig` | the Digital simulator circuit |
| `note.ods` | LibreOffice Calc scratch paper |
| `note.csv` | CSV scratch table |

The scanner recognises **only these names**. A PDF/DIG/ODS/CSV with any other name fails validation, as does having both `note.ods` and `note.csv`, or having resources without `metadata.json`. Junk (`desktop.ini`, `.~lock.*#`) is ignored with a warning.

## Config reference

### `group.json`

```json
{
  "schemaVersion": 1,
  "id": "simulation/lab-01",
  "title": "Lab_01",
  "order": 1
}
```

- `id` — unique, stable identifier (does not need to match the folder path)
- `title` — the text shown in the sidebar tree
- `order` — integer ≥ 0; siblings must not share an order value; the tree sorts by it

### `metadata.json`

```json
{
  "schemaVersion": 1,
  "id": "simulation/lab-01/01",
  "aliases": ["Simulation/Lab_01/01"],
  "title": "01",
  "order": 1,
  "kind": "lab"
}
```

- `id` — unique canonical id, lowercase kebab-case with `/` separators
- `aliases` — old route ids that should still resolve to this problem (used when ids change)
- `title` — display title
- `order` — integer ≥ 0, unique among siblings in the same group
- `kind` — free-form content-type metadata (e.g. `exam`, `lab`, `learning`); does not affect rendering
- Resource availability is derived from which canonical files exist — never list filenames here

## Common tasks

### Add a group

1. Create a directory under `content/` (e.g. `content/quizzes/`).
2. Add `group.json` with a unique `id`, a `title`, and an `order` that no sibling group uses.
3. Run `npm run index`.

The group appears in the tree. No code changes.

### Add a nested group

Same thing, one level deeper: create `content/quizzes/week-1/`, give it its own `group.json`. Hierarchy depth is unlimited.

### Add a problem

1. Create a directory inside any group (e.g. `content/quizzes/week-1/q1/`).
2. Add `metadata.json` with a unique `id`, `title`, and sibling-unique `order`.
3. Drop in `statement.pdf` and/or `solution.dig` (at least one), optionally `note.ods` **or** `note.csv`.
4. Run `npm run index` (or `npm run build` for a full build).

The problem appears in the tree, search and routes automatically.

### Change an ID later

Edit `id` in `metadata.json` and put the old id in `aliases` so existing links keep working:

```json
{
  "schemaVersion": 1,
  "id": "quizzes/week-1/new-name",
  "aliases": ["quizzes/week-1/old-name"],
  "title": "Q1",
  "order": 1,
  "kind": "quiz"
}
```

Aliases must be globally unique and must not collide with any canonical id — the build fails otherwise.

### Choosing `order`

Use small integers (1, 2, 3…) within a group. Only sibling order matters; different groups can reuse numbers. Renumber freely — nothing else references these values.

## Development

Requires Node.js 20+, Java 11+ (for Digital), and LibreOffice (for ODS notes).

```bash
npm run tools     # one-time: download Digital simulator (~12 MB)
npm run index     # scan content/ → data/problems.json + data/site.json
npm run render    # .dig → SVG, note.ods/.csv → HTML (cached by mtime)
npm run dev       # serve repository root at http://localhost:4173
```

Full verification and production build:

```bash
npm run verify          # build → test → lint
npm run dev -- --dist   # preview dist/
```

> `data/problems.json` and `data/site.json` are **generated outputs** — never edit them by hand. The browser reads only the generated manifest, never `metadata.json`/`group.json` directly.

## Project structure

```
.
├── content/              # all course content (groups + problems)
├── unassigned-content/   # quarantined files awaiting manual review (not scanned)
├── data/                 # generated manifests (gitignored: site.json)
├── generated/            # rendered SVG + note HTML (gitignored)
├── tools/                # Digital simulator (gitignored)
├── scripts/              # index, render, build, serve, audit
├── src/                  # browser app (no framework, no dependencies)
├── test/                 # node:test suite
└── dist/                 # production build output (gitignored)
```

The production `dist/` contains `content/` resources, `generated/` assets, `data/site.json`, `src/` and `index.html` — but never `metadata.json`/`group.json` (runtime doesn't read them) or quarantined files.

## Adding new resource *types*

The four canonical resource types are built in. New kinds (video, Markdown, image galleries, other simulators) will need a new renderer — there is deliberately no generic plugin system yet.

## GitHub Pages

Settings → Pages → Source: **GitHub Actions**. Push to `main` runs the build, tests and content audit, then deploys `dist/`. All paths are relative, so the site works from the repository subpath.

## License

Course content © respective authors. Site code available for personal study use.
