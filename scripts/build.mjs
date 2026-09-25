import { spawn } from 'node:child_process';
import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSiteRecords, scanContent } from './lib/manifest.mjs';
import { copyContentTree } from './lib/dist-copy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', script)], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`))));
  });
}

await run('render-svg.mjs');
await run('render-notes.mjs');

let result;
try {
  result = await scanContent(root);
} catch (error) {
  console.error(`✗ Content validation failed${error.file ? ` (${error.file})` : ''}: ${error.message}`);
  process.exit(1);
}

const site = buildSiteRecords(result.problems);

await mkdir(path.join(root, 'data'), { recursive: true });
await writeFile(path.join(root, 'data', 'problems.json'), `${JSON.stringify(result.problems, null, 2)}\n`);
await writeFile(path.join(root, 'data', 'site.json'), `${JSON.stringify(site, null, 2)}\n`);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of ['index.html', 'src', 'data', 'generated']) {
  if (await stat(path.join(root, entry)).catch(() => null)) {
    await cp(path.join(root, entry), path.join(dist, entry), { recursive: true });
  }
}

// Copy content resources into dist without configs (metadata.json/group.json)
// and without junk — the browser only consumes generated manifests.
if (await stat(path.join(root, 'content')).catch(() => null)) {
  await copyContentTree(path.join(root, 'content'), path.join(dist, 'content'));
}

await writeFile(path.join(dist, '.nojekyll'), '');
console.log(`Built dist/ — ${site.length} problems, ${site.filter((p) => p.pdf).length} statements, ${site.filter((p) => p.dig).length} solutions, ${site.filter((p) => p.hasNote).length} notes.`);
