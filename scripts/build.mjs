import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSiteRecords, scanContent } from './lib/manifest.mjs';
import { copyContentTree } from './lib/dist-copy.mjs';
import { patchDigitalJvmClass } from './lib/digital-patch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', script)], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`))));
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0
      ? resolve()
      : reject(new Error(`${command} exited with ${code}`))));
  });
}

async function patchDigitalJar(jarPath, patchesDir) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'diglo-digital-patch-'));
  try {
    // 1. Bytecode patch: JVM.class skips XStream's unsupported Unsafe
    //    field-write probe and selects SunLimitedUnsafeReflectionProvider.
    const classPath = path.join('com', 'thoughtworks', 'xstream', 'core', 'JVM.class');
    await runCommand('jar', ['xf', jarPath, classPath], { cwd: temp });
    const classFile = path.join(temp, classPath);
    await writeFile(classFile, patchDigitalJvmClass(await readFile(classFile)));
    await runCommand('jar', ['uf', jarPath, classPath], { cwd: temp });

    // 2. Source patch: compile the XStream classes with CheerpJ fallbacks.
    //    CheerpJ 4.3 can throw ArrayIndexOutOfBoundsException from reflective
    //    instantiation (Class.newInstance) while Digital deserializes a
    //    circuit's ROMManagerFile on the AWT EDT — this breaks every .dig
    //    that carries a <romList>. The replacements catch that failure and
    //    fall back to direct constructors / degraded lookups.
    const sources = [
      path.join(patchesDir, 'com', 'thoughtworks', 'xstream', 'converters', 'collections', 'AbstractCollectionConverter.java'),
      path.join(patchesDir, 'com', 'thoughtworks', 'xstream', 'core', 'util', 'SerializationMembers.java'),
    ];
    const outDir = path.join(temp, 'patched');
    await mkdir(outDir, { recursive: true });
    await runCommand('javac', ['--release', '8', '-Xlint:-options', '-nowarn', '-cp', jarPath, '-d', outDir, ...sources]);
    await runCommand('jar', ['uf', jarPath, '-C', outDir, 'com']);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
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

for (const entry of ['index.html', 'interactive.html', 'src', 'data', 'generated']) {
  if (await stat(path.join(root, entry)).catch(() => null)) {
    await cp(path.join(root, entry), path.join(dist, entry), { recursive: true });
  }
}

// Copy content resources into dist without configs (metadata.json/group.json)
// and without junk — the browser only consumes generated manifests.
if (await stat(path.join(root, 'content')).catch(() => null)) {
  await copyContentTree(path.join(root, 'content'), path.join(dist, 'content'));
}

const digitalSource = path.join(root, 'tools', 'Digital');
const digitalTarget = path.join(dist, 'vendor', 'digital');
if (!(await stat(path.join(digitalSource, 'Digital.jar')).catch(() => null))) {
  throw new Error('Digital runtime missing. Run npm run tools before npm run build.');
}
await mkdir(digitalTarget, { recursive: true });
for (const name of await readdir(digitalSource)) {
  if (name.endsWith('.jar')) await cp(path.join(digitalSource, name), path.join(digitalTarget, name));
}
await patchDigitalJar(path.join(digitalTarget, 'Digital.jar'), path.join(root, 'patches', 'xstream'));

await writeFile(path.join(dist, '.nojekyll'), '');
console.log(`Built dist/ — ${site.length} problems, ${site.filter((p) => p.pdf).length} statements, ${site.filter((p) => p.dig).length} solutions, ${site.filter((p) => p.hasNote).length} notes, Digital runtime bundled.`);
