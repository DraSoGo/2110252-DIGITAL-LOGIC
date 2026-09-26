import test from 'node:test';
import assert from 'node:assert/strict';
import { patchDigitalJvmClass } from '../scripts/lib/digital-patch.mjs';

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
