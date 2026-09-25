import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanContent } from './lib/manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
const warnings = [];

// 1. Content scan — full schema, canonical filename, duplicate and orphan
//    validation lives in the scanner itself; surface its errors here.
let scan = null;
try {
  scan = await scanContent(root);
} catch (error) {
  const location = error.file ? ` (${error.file}${error.field ? ` field: ${error.field}` : ''})` : '';
  failures.push(`content validation${location}: ${error.message}`);
}
if (scan) {
  for (const warning of scan.warnings) warnings.push(warning);

  // 2. Committed manifest must not be stale.
  let manifest = null;
  try {
    manifest = JSON.parse(await readFile(path.join(root, 'data', 'problems.json'), 'utf8'));
  } catch {
    warnings.push('data/problems.json missing or invalid — run: npm run index');
  }
  if (manifest !== null) {
    if (!Array.isArray(manifest) || !manifest.length) {
      failures.push('data/problems.json is empty — run: npm run index');
    } else if (JSON.stringify(manifest) !== JSON.stringify(scan.problems)) {
      warnings.push('data/problems.json is stale (content tree changed) — run: npm run index');
    }
    for (const problem of manifest || []) {
      for (const key of ['pdf', 'dig', 'ods', 'csv']) {
        if (problem[key] && !(await stat(path.join(root, problem[key])).catch(() => null))) {
          failures.push(`${problem.id}: ${key} file missing on disk: ${problem[key]}`);
        }
      }
    }
  }

  // 3. Generated site manifest (only when it exists) must reference real files.
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
  } else {
    warnings.push('data/site.json not built yet — run: npm run build');
  }
}

// 4. Quarantine area must never leak into the content tree.
const unassignedDir = path.join(root, 'unassigned-content');
if (await stat(unassignedDir).catch(() => null)) {
  const items = await readdir(unassignedDir);
  if (items.length) warnings.push(`unassigned-content/ holds ${items.length} item(s) awaiting review: ${items.join(', ')}`);
}

// 5. Tools (warn only).
if (!(await stat(path.join(root, 'tools', 'Digital', 'Digital.jar')).catch(() => null))) {
  warnings.push('tools/Digital/Digital.jar missing — run: npm run tools');
}

// 6. If dist exists, configs must not have leaked into it.
const distContent = path.join(root, 'dist', 'content');
if (await stat(distContent).catch(() => null)) {
  const leaked = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'metadata.json' || entry.name === 'group.json') leaked.push(path.relative(root, path.join(dir, entry.name)));
      if (entry.isDirectory()) await walk(path.join(dir, entry.name));
    }
  }
  await walk(distContent);
  if (leaked.length) failures.push(`config files leaked into dist/content: ${leaked.join(', ')}`);
}

for (const warning of warnings) console.warn(`  ⚠ ${warning}`);
if (failures.length) {
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`Content audit failed with ${failures.length} error(s).`);
  process.exit(1);
}
console.log(`Content audit passed — ${scan ? scan.problems.length : 0} problems, ${scan ? scan.groups.length : 0} groups, ${warnings.length} warning(s).`);
