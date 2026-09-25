import { spawn } from 'node:child_process';
import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProblemLibrary } from './lib/manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const flat = (id) => id.split('/').join('__');

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', script)], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`))));
  });
}

await run('render-svg.mjs');
await run('render-notes.mjs');

const problems = await scanProblemLibrary(root);
const site = problems.map((p) => ({
  ...p,
  svg: p.dig ? `generated/svg/${flat(p.id)}.svg` : null,
  note: p.ods || p.csv ? `generated/note/${flat(p.id)}.html` : null,
}));

await mkdir(path.join(root, 'data'), { recursive: true });
await writeFile(path.join(root, 'data', 'problems.json'), `${JSON.stringify(problems, null, 2)}\n`);
await writeFile(path.join(root, 'data', 'site.json'), `${JSON.stringify(site, null, 2)}\n`);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of ['index.html', 'src', 'data', 'generated']) {
  if (await stat(path.join(root, entry)).catch(() => null)) {
    await cp(path.join(root, entry), path.join(dist, entry), { recursive: true });
  }
}

let copied = 0;
for (const problem of site) {
  for (const file of [problem.pdf, problem.dig, problem.ods, problem.csv]) {
    if (!file) continue;
    const target = path.join(dist, file);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(root, file), target);
    copied++;
  }
}
await writeFile(path.join(dist, '.nojekyll'), '');
console.log(`Built dist/ — ${site.length} problems, ${copied} source files copied.`);
