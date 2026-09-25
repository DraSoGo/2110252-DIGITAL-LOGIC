import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../src/lib/content.js';
import { scanContent } from './lib/manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'generated', 'note');
const force = process.argv.includes('--force');

const flatId = (id) => id.split('/').join('__');

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('soffice', ['--headless', ...args], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`soffice exited with ${code}`))));
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function csvToHtml(csvText, title) {
  const rows = parseCsv(csvText);
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((cell) => (rowIndex === 0 ? `<th>${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`)).join('');
    return `<tr>${cells}</tr>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body { margin: 0; padding: 16px; font-family: 'Liberation Sans', Arial, sans-serif; background: #fff; color: #1a2733; }
table { border-collapse: collapse; }
th, td { border: 1px solid #8da0a7; padding: 5px 10px; font-size: 13px; text-align: left; white-space: nowrap; }
th { background: #dce8eb; font-weight: 600; }
</style></head>
<body><table>${body}</table></body>
</html>
`;
}

async function odsToHtml(source, workDir) {
  await run(['--convert-to', 'html', '--outdir', workDir, source]);
  const produced = (await readdir(workDir)).filter((name) => name.endsWith('.html'));
  if (!produced.length) throw new Error('soffice produced no HTML output');
  let html = await readFile(path.join(workDir, produced[0]), 'utf8');
  const imageNames = (await readdir(workDir)).filter((name) => /\.(png|gif|jpe?g)$/i.test(name));
  for (const image of imageNames) {
    const base64 = Buffer.from(await readFile(path.join(workDir, image))).toString('base64');
    const ext = image.split('.').pop().toLowerCase();
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    html = html.split(`src="${image}"`).join(`src="data:image/${mime};base64,${base64}"`);
  }
  return html;
}

let result;
try {
  result = await scanContent(root);
} catch (error) {
  console.error(`✗ Content validation failed${error.file ? ` (${error.file})` : ''}: ${error.message}`);
  process.exit(1);
}

const targets = result.problems.filter((p) => p.ods || p.csv);
await mkdir(outDir, { recursive: true });

// Drop notes whose problem no longer exists.
const expected = new Set(targets.map((p) => `${flatId(p.id)}.html`));
const existing = await readdir(outDir).catch(() => []);
for (const name of existing.filter((name) => name.endsWith('.html') && !expected.has(name))) {
  await rm(path.join(outDir, name), { force: true });
}

let rendered = 0;
let skipped = 0;
const failures = [];

for (const problem of targets) {
  const sourceRelative = problem.ods || problem.csv;
  const source = path.join(root, sourceRelative);
  const output = path.join(outDir, `${flatId(problem.id)}.html`);
  const [sourceStat, outputStat] = await Promise.all([stat(source), stat(output).catch(() => null)]);
  if (!force && outputStat && outputStat.mtimeMs >= sourceStat.mtimeMs) { skipped++; continue; }
  if (problem.ods) {
    const workDir = await mkdtemp(path.join(tmpdir(), 'diglo-note-'));
    try {
      const html = await odsToHtml(source, workDir);
      await writeFile(output, html);
      rendered++;
    } catch (error) {
      failures.push(`${problem.id}: ${error.message}`);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  } else {
    try {
      const html = csvToHtml(await readFile(source, 'utf8'), problem.title);
      await writeFile(output, html);
      rendered++;
    } catch (error) {
      failures.push(`${problem.id}: ${error.message}`);
    }
  }
}

console.log(`Note render complete — rendered ${rendered}, skipped ${skipped}, failed ${failures.length}.`);
if (failures.length) {
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
