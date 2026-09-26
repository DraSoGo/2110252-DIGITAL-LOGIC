const PATCHES = [
  // Skip XStream's unsupported full Unsafe field-write probe and jump to its
  // SunLimitedUnsafeReflectionProvider fallback. CheerpJ supports the Unsafe
  // allocation used by that provider, while regular reflection handles writes.
  ['2dc601ad', '2dc7019c'],
  ['2dc70009', '2dc60009'],
];

export function patchDigitalJvmClass(input) {
  const output = Buffer.from(input);
  for (const [beforeHex, afterHex] of PATCHES) {
    const before = Buffer.from(beforeHex, 'hex');
    const after = Buffer.from(afterHex, 'hex');
    const offset = output.indexOf(before);
    if (offset < 0 || output.indexOf(before, offset + 1) >= 0) {
      throw new Error(`Digital.jar does not contain the expected XStream 1.4.20 bytecode signature (${beforeHex})`);
    }
    after.copy(output, offset);
  }
  return output;
}
