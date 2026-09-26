import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchDigitalJvmClass } from '../scripts/lib/digital-patch.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Digital XStream patch selects limited unsafe reflection without running unsupported field probes', () => {
  const original = Buffer.from('aa2dc601adbb2dc70009cc', 'hex');
  const patched = patchDigitalJvmClass(original);

  assert.equal(original.toString('hex'), 'aa2dc601adbb2dc70009cc');
  assert.equal(patched.toString('hex'), 'aa2dc7019cbb2dc60009cc');
});

test('Digital XStream patch rejects an unknown or already-patched class', () => {
  assert.throws(
    () => patchDigitalJvmClass(Buffer.from('cafebabe', 'hex')),
    /expected XStream 1\.4\.20 bytecode signature/,
  );
});

// Regression for the CheerpJ ArrayIndexOutOfBoundsException that broke every
// .dig carrying a <romList> (ROMManagerFile deserialization). The build must
// keep compiling these two XStream replacements into the bundled jar.
test('XStream CheerpJ fallback patch sources are present and declared', async () => {
  const sources = [
    'patches/xstream/com/thoughtworks/xstream/converters/collections/AbstractCollectionConverter.java',
    'patches/xstream/com/thoughtworks/xstream/core/util/SerializationMembers.java',
  ];
  for (const relative of sources) {
    const file = path.join(repoRoot, relative);
    assert.ok(await stat(file).then(() => true).catch(() => false), `${relative} must exist`);
    const source = await readFile(file, 'utf8');
    assert.match(source, /CheerpJ/, `${relative} must document the CheerpJ fallback`);
  }

  // The collection converter must fall back to direct constructors and the
  // serialization members must degrade gracefully instead of throwing.
  const converter = await readFile(path.join(repoRoot, sources[0]), 'utf8');
  assert.match(converter, /directCollection/);
  assert.match(converter, /catch \(RuntimeException e\)/);
  const members = await readFile(path.join(repoRoot, sources[1]), 'utf8');
  assert.match(members, /catch \(final ArrayIndexOutOfBoundsException e\)/);

  // The build script must compile and inject these sources into the jar.
  const build = await readFile(path.join(repoRoot, 'scripts', 'build.mjs'), 'utf8');
  assert.match(build, /patches.*xstream/, 'build.mjs must reference the patches directory');
  assert.match(build, /javac/, 'build.mjs must compile the patch sources');
});
