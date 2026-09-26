const CHEERPJ_LOADER = 'https://cjrtnc.leaningtech.com/4.3/loader.js';
const DIGITAL_JAR = 'vendor/digital/Digital.jar';
const SOURCE_FILE = '/str/solution.dig';

function appFile(path, documentBase) {
  const base = new URL(documentBase);
  const file = new URL(path, base);
  if (file.origin !== base.origin) throw new Error('Digital runtime files must use the page origin');
  return `/app${file.pathname}`;
}

export function waitForDigitalDisplay(host, { timeout = 90_000 } = {}) {
  const hasWindow = () => Boolean(host.querySelector('canvas, .cjWindow'));
  if (hasWindow()) return Promise.resolve();
  const BrowserMutationObserver = host.ownerDocument?.defaultView?.MutationObserver;
  if (!BrowserMutationObserver) return Promise.reject(new Error('Digital display cannot be observed'));

  return new Promise((resolve, reject) => {
    const observer = new BrowserMutationObserver(() => {
      if (!hasWindow()) return;
      clearTimeout(timer);
      observer.disconnect();
      resolve();
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error('Digital window did not appear. The simulator failed during startup.'));
    }, timeout);
    observer.observe(host, { childList: true, subtree: true });
  });
}

export function createDigitalRuntime({
  loadScript,
  fetchBytes,
  cheerpj,
  documentBase,
  host,
  waitForDisplay = waitForDigitalDisplay,
}) {
  let currentState = 'idle';
  let currentError = null;
  let startPromise = null;

  async function start(problem) {
    if (currentState === 'ready') return;
    if (startPromise) return startPromise;
    if (!problem?.dig) throw new Error('A configured .dig solution is required');
    startPromise = (async () => {
      try {
        currentState = 'loading-runtime';
        await loadScript(CHEERPJ_LOADER);
        await cheerpj.cheerpjInit({
          version: 11,
          javaProperties: ['java.vm.vendor=Leaning Technologies', 'java.specification.version=11'],
        });
        currentState = 'loading-circuit';
        const bytes = await fetchBytes(new URL(problem.dig, documentBase));
        await cheerpj.cheerpOSAddStringFile(SOURCE_FILE, bytes);
        currentState = 'starting';
        await cheerpj.cheerpjCreateDisplay(-1, -1, host);
        const programStopped = cheerpj.cheerpjRunJar(
          appFile(DIGITAL_JAR, documentBase),
          SOURCE_FILE,
        ).then(
          (exitCode) => { throw new Error(`Digital exited before its window appeared (code ${exitCode})`); },
          (error) => { throw error; },
        );
        // A successful desktop app keeps its main promise pending while the
        // AWT event loop is alive. Readiness is the first rendered Java window,
        // not the resolution of cheerpjRunJar (which means the app stopped).
        programStopped.catch(() => {});
        await Promise.race([waitForDisplay(host), programStopped]);
        currentState = 'ready';
      } catch (error) {
        currentError = error;
        currentState = 'failed';
        throw error;
      }
    })();
    return startPromise;
  }

  return { start, state: () => currentState, error: () => currentError };
}
