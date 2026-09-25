import { spawn } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jar = path.join(root, 'tools', 'Digital', 'Digital.jar');
const force = process.argv.includes('--force');

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
  });
}

if (!force && (await stat(jar).catch(() => null))) {
  console.log('tools/Digital/Digital.jar already present — skipping. Use --force to re-download.');
  process.exit(0);
}

const url = 'https://github.com/hneemann/Digital/releases/latest/download/Digital.zip';
const zip = path.join(root, 'tools', 'Digital.zip');

console.log(`Downloading ${url} ...`);
const response = await fetch(url);
if (!response.ok) {
  console.error(`Download failed: HTTP ${response.status}`);
  process.exit(1);
}
const bytes = Buffer.from(await response.arrayBuffer());
await mkdir(path.dirname(zip), { recursive: true });
await writeFile(zip, bytes);
console.log(`Downloaded ${(bytes.length / 1e6).toFixed(1)} MB — extracting ...`);

await rm(path.join(root, 'tools', 'Digital'), { recursive: true, force: true });
await run('unzip', ['-o', '-q', zip, '-d', path.join(root, 'tools')]);
await rm(zip, { force: true });

if (!(await stat(jar).catch(() => null))) {
  console.error('Extraction finished but Digital.jar was not found — check the release layout.');
  process.exit(1);
}
console.log('Digital simulator ready at tools/Digital/Digital.jar');
