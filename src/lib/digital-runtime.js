const CHEERPJ_LOADER = 'https://cjrtnc.leaningtech.com/4.3/loader.js';
const DIGITAL_JAR = '/app/vendor/digital/Digital.jar';
const SOURCE_FILE = '/str/solution.dig';

export function createDigitalRuntime({ loadScript, fetchBytes, cheerpj, documentBase, host }) {
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
        await cheerpj.cheerpjInit({ version: 11, overrideDocumentBase: documentBase });
        currentState = 'loading-circuit';
        const bytes = await fetchBytes(new URL(problem.dig, documentBase));
        await cheerpj.cheerpOSAddStringFile(SOURCE_FILE, bytes);
        currentState = 'starting';
        await cheerpj.cheerpjCreateDisplay(-1, -1, host);
        await cheerpj.cheerpjRunJar(DIGITAL_JAR, SOURCE_FILE);
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
