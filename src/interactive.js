import { createDigitalRuntime } from './lib/digital-runtime.js';
import { resolveInteractiveProblem } from './lib/interactive-problem.js';

const back = document.querySelector('#interactive-back');
const download = document.querySelector('#interactive-download');
const title = document.querySelector('#interactive-title');
const status = document.querySelector('#interactive-status');
const display = document.querySelector('#digital-display');
const fallback = document.querySelector('#interactive-fallback');

function asset(path) { return new URL(path, document.baseURI).href; }

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('CheerpJ could not be loaded. Check your network connection.'));
    document.head.appendChild(script);
  });
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Circuit download failed: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function showFailure(message) {
  status.textContent = 'SIMULATOR UNAVAILABLE';
  fallback.hidden = false;
  fallback.innerHTML = `<code>STATUS: FAILED</code><h1>Digital could not start</h1><p>${message}</p><p>Download the source circuit and open it in Digital locally, or return to the static SVG preview.</p>`;
}

async function boot() {
  try {
    const response = await fetch(asset('data/site.json'));
    if (!response.ok) throw new Error(`Manifest download failed: HTTP ${response.status}`);
    const problems = await response.json();
    const result = resolveInteractiveProblem(problems, location.search);
    if (!result.problem) throw new Error(result.error.replace('-', ' '));
    const problem = result.problem;
    title.textContent = `${problem.groupPath.join(' / ')} / ${problem.title}`;
    document.title = `${problem.title} — Interactive Digital`;
    back.href = `${asset('index.html')}#/problem/${encodeURIComponent(problem.id)}`;
    download.href = asset(problem.dig);
    status.textContent = 'LOADING DIGITAL RUNTIME…';
    const runtime = createDigitalRuntime({
      loadScript,
      fetchBytes,
      cheerpj: window,
      documentBase: document.baseURI,
      host: display,
    });
    await runtime.start(problem);
    status.textContent = 'INTERACTIVE — USE SAVE AS TO EXPORT EDITS';
  } catch (error) {
    showFailure(error.message || 'Unexpected interactive simulator error.');
  }
}

boot();
