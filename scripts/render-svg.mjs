import { spawn } from 'node:child_process';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanContent } from './lib/manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jar = path.join(root, 'tools', 'Digital', 'Digital.jar');
const outDir = path.join(root, 'generated', 'svg');
const force = process.argv.includes('--force');

// Canonical ids are already lowercase kebab-case with slashes — safe as a
// flat filename once slashes are folded (avoids deep generated trees).
const flatId = (id) => id.split('/').join('__');

function runJava(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('java', ['-Djava.awt.headless=true', '-cp', jar, 'CLI', 'svg', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `java exited with ${code}`))));
  });
}

if (!(await stat(jar).catch(() => null))) {
  console.error('tools/Digital/Digital.jar not found. Run: npm run tools');
  process.exit(1);
}

let result;
try {
  result = await scanContent(root);
} catch (error) {
  console.error(`✗ Content validation failed${error.file ? ` (${error.file})` : ''}: ${error.message}`);
  process.exit(1);
}

const problems = result.problems.filter((p) => p.dig);
await mkdir(outDir, { recursive: true });

// Drop SVGs whose problem no longer exists (stale outputs from renamed ids).
const expected = new Set(problems.map((p) => `${flatId(p.id)}.svg`));
const existingSvgs = await readdir(outDir).catch(() => []);
const stale = existingSvgs.filter((name) => name.endsWith('.svg') && !expected.has(name));
for (const name of stale) await rm(path.join(outDir, name), { force: true });

let rendered = 0;
let skipped = 0;
const failures = [];

for (const problem of problems) {
  const source = path.join(root, problem.dig);
  const output = path.join(outDir, `${flatId(problem.id)}.svg`);
  const [sourceStat, outputStat] = await Promise.all([stat(source), stat(output).catch(() => null)]);
  if (!force && outputStat && outputStat.mtimeMs >= sourceStat.mtimeMs) { skipped++; continue; }
  try {
    // -ieee renders ANSI/IEEE gate shapes (AND curved back, OR curved front,
    // NOT triangle + bubble) matching the Digital app's default look, instead
    // of rectangular DIN boxes labelled "&" / "≥1".
    await runJava(['-dig', source, '-svg', output, '-ieee']);
    rendered++;
  } catch (error) {
    failures.push(`${problem.id}: ${error.message}`);
  }
}

console.log(`SVG render complete — rendered ${rendered}, skipped ${skipped}, removed ${stale.length} stale, failed ${failures.length}.`);
if (failures.length) {
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
