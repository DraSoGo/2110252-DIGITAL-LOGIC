import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSiteRecords, scanContent } from './lib/manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let result;
try {
  result = await scanContent(root);
} catch (error) {
  const location = error.file ? ` (${error.file}${error.field ? ` field: ${error.field}` : ''})` : '';
  console.error(`✗ Content validation failed${location}: ${error.message}`);
  process.exit(1);
}

// Validate fully before writing — a failed scan must never produce a partial manifest.
await mkdir(path.join(root, 'data'), { recursive: true });
await writeFile(path.join(root, 'data', 'problems.json'), `${JSON.stringify(result.problems, null, 2)}\n`);
await writeFile(path.join(root, 'data', 'site.json'), `${JSON.stringify(buildSiteRecords(result.problems), null, 2)}\n`);

for (const warning of result.warnings) console.warn(`  ⚠ ${warning}`);
console.log(`Indexed ${result.problems.length} problems across ${result.groups.length} groups (${result.warnings.length} warning(s)).`);
