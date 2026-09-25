import { spawn } from 'node:child_process';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProblemLibrary } from './lib/manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jar = path.join(root, 'tools', 'Digital', 'Digital.jar');
const outDir = path.join(root, 'generated', 'svg');
const force = process.argv.includes('--force');

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

const problems = (await scanProblemLibrary(root)).filter((p) => p.dig);
await mkdir(outDir, { recursive: true });

let rendered = 0;
let skipped = 0;
const failures = [];

for (const problem of problems) {
  const source = path.join(root, problem.dig);
  const output = path.join(outDir, `${flatId(problem.id)}.svg`);
  const [sourceStat, outputStat] = await Promise.all([stat(source), stat(output).catch(() => null)]);
  if (!force && outputStat && outputStat.mtimeMs >= sourceStat.mtimeMs) { skipped++; continue; }
  try {
    await runJava(['-dig', source, '-svg', output]);
    rendered++;
  } catch (error) {
    failures.push(`${problem.id}: ${error.message}`);
  }
}

console.log(`SVG render complete — rendered ${rendered}, skipped ${skipped}, failed ${failures.length}.`);
if (failures.length) {
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
