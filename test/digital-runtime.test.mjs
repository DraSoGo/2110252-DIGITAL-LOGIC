import test from 'node:test';
import assert from 'node:assert/strict';
import { createDigitalRuntime } from '../src/lib/digital-runtime.js';

function fakeRuntime() {
  const calls = [];
  const cheerpj = {
    async cheerpjInit(options) { calls.push(['init', options]); },
    async cheerpOSAddStringFile(path, bytes) { calls.push(['file', path, [...bytes]]); },
    async cheerpjCreateDisplay(width, height, host) { calls.push(['display', width, height, host]); },
    cheerpjRunJar(jar, source) {
      calls.push(['jar', jar, source]);
      return new Promise(() => {});
    },
  };
  return { calls, cheerpj };
}

test('Digital runtime loads one circuit into CheerpJ and starts one JAR', async () => {
  const { calls, cheerpj } = fakeRuntime();
  const runtime = createDigitalRuntime({
    loadScript: async (url) => calls.push(['loader', url]),
    fetchBytes: async (url) => { calls.push(['fetch', String(url)]); return new Uint8Array([1, 2]); },
    cheerpj,
    documentBase: 'https://example.test/2110252-DIGITAL-LOGIC/',
    host: 'digital-host',
    waitForDisplay: async (host) => calls.push(['ready-display', host]),
  });
  await runtime.start({ dig: 'content/simulation/lab-01/01/solution.dig' });
  await runtime.start({ dig: 'content/simulation/lab-01/01/solution.dig' });
  assert.deepEqual(calls, [
    ['loader', 'https://cjrtnc.leaningtech.com/4.3/loader.js'],
    ['init', {
      version: 11,
      javaProperties: ['java.vm.vendor=Leaning Technologies', 'java.specification.version=11'],
    }],
    ['fetch', 'https://example.test/2110252-DIGITAL-LOGIC/content/simulation/lab-01/01/solution.dig'],
    ['file', '/str/solution.dig', [1, 2]],
    ['display', -1, -1, 'digital-host'],
    ['jar', '/app/2110252-DIGITAL-LOGIC/vendor/digital/Digital.jar', '/str/solution.dig'],
    ['ready-display', 'digital-host'],
  ]);
  assert.equal(runtime.state(), 'ready');
});

test('Digital runtime records a circuit fetch failure', async () => {
  const { cheerpj } = fakeRuntime();
  const runtime = createDigitalRuntime({
    loadScript: async () => {},
    fetchBytes: async () => { throw new Error('offline'); },
    cheerpj,
    documentBase: 'https://example.test/',
    host: 'digital-host',
    waitForDisplay: async () => {},
  });
  await assert.rejects(() => runtime.start({ dig: 'content/a.dig' }), /offline/);
  assert.equal(runtime.state(), 'failed');
  assert.match(runtime.error().message, /offline/);
});

test('Digital runtime fails instead of reporting ready when no Java window appears', async () => {
  const { cheerpj } = fakeRuntime();
  const runtime = createDigitalRuntime({
    loadScript: async () => {},
    fetchBytes: async () => new Uint8Array([1]),
    cheerpj,
    documentBase: 'https://example.test/course/',
    host: 'digital-host',
    waitForDisplay: async () => { throw new Error('Digital window did not appear'); },
  });

  await assert.rejects(() => runtime.start({ dig: 'content/a.dig' }), /window did not appear/);
  assert.equal(runtime.state(), 'failed');
});
