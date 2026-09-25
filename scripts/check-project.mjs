import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProblemLibrary } from './lib/manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IGNORED = new Set(['.git', '.github', 'tools', 'generated', 'data', 'src', 'scripts', 'test', 'dist', 'node_modules']);
const JUNK = /^(desktop\.ini|\.~lock\..*#)$/;

const failures = [];
const warnings = [];

// 1. Committed manifest must be valid and reference existing files.
let manifest = null;
try {
  manifest = JSON.parse(await readFile(path.join(root, 'data', 'problems.json'), 'utf8'));
} catch {
  failures.push('data/problems.json is missing or invalid — run: npm run index');
}
if (manifest !== null) {
  if (!Array.isArray(manifest) || !manifest.length) {
    failures.push('data/problems.json is empty — run: npm run index');
  } else {
    for (const problem of manifest) {
      if (!problem.dig && !problem.pdf) failures.push(`${problem.id}: has neither .dig nor .pdf`);
      for (const key of ['pdf', 'dig', 'ods', 'csv']) {
        if (problem[key] && !(await stat(path.join(root, problem[key])).catch(() => null))) {
          failures.push(`${problem.id}: ${key} file missing on disk: ${problem[key]}`);
        }
      }
    }
    const fresh = await scanProblemLibrary(root);
    if (JSON.stringify(fresh) !== JSON.stringify(manifest)) {
      warnings.push('data/problems.json is stale (content tree changed) — run: npm run index');
    }
  }
}

// 2. Junk files inside content trees (warn — scanner and git ignore them anyway).
async function findJunk(dir, out) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isFile() && JUNK.test(entry.name)) out.push(path.relative(root, path.join(dir, entry.name)));
    else if (entry.isDirectory() && !entry.name.startsWith('.') && !IGNORED.has(entry.name)) {
      await findJunk(path.join(dir, entry.name), out);
    }
  }
}
const junk = [];
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isDirectory() && !entry.name.startsWith('.') && !IGNORED.has(entry.name)) {
    await findJunk(path.join(root, entry.name), junk);
  }
}
for (const file of junk) warnings.push(`junk file present: ${file}`);

// 3. Tools (warn only).
if (!(await stat(path.join(root, 'tools', 'Digital', 'Digital.jar')).catch(() => null))) {
  warnings.push('tools/Digital/Digital.jar missing — run: npm run tools');
}

// 4. If site.json exists, its generated references must resolve.
let site = null;
try {
  site = JSON.parse(await readFile(path.join(root, 'data', 'site.json'), 'utf8'));
} catch {
  /* not built yet — fine */
}
if (Array.isArray(site)) {
  for (const problem of site) {
    for (const key of ['svg', 'note']) {
      if (problem[key] && !(await stat(path.join(root, problem[key])).catch(() => null))) {
        failures.push(`${problem.id}: ${key} referenced by site.json but missing: ${problem[key]}`);
      }
    }
  }
}

for (const warning of warnings) console.warn(`  ⚠ ${warning}`);
if (failures.length) {
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`Content audit failed with ${failures.length} error(s).`);
  process.exit(1);
}
console.log(`Content audit passed — ${manifest ? manifest.length : 0} problems, ${warnings.length} warning(s).`);
