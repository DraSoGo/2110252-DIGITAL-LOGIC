import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- Regression: Digital CLI must render with IEEE gate shapes ---------- */

test('render-svg.mjs passes -ieee to the Digital CLI', async () => {
  const source = await readFile(path.join(repoRoot, 'scripts', 'render-svg.mjs'), 'utf8');
  // The exact java invocation must carry the flag — rectangular DIN boxes
  // (gates drawn as rectangles labelled "&" / "≥1") must not come back.
  assert.match(
    source,
    /runJava\(\['-dig',\s*source,\s*'-svg',\s*output,\s*'-ieee'\]\)/,
    "render-svg.mjs must call runJava(['-dig', source, '-svg', output, '-ieee'])",
  );
});

test('generated SVGs contain no DIN gate labels', async () => {
  const svgDir = path.join(repoRoot, 'generated', 'svg');
  const files = (await readdir(svgDir).catch(() => [])).filter((name) => name.endsWith('.svg'));
  if (!files.length) {
    assert.ok(true, 'no generated SVGs yet (run npm run build) — skipped');
    return;
  }
  for (const name of files) {
    const svg = await readFile(path.join(svgDir, name), 'utf8');
    const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1].trim());
    // A DIN gate is a rectangle whose only symbol is "&" or "≥1". Note: real
    // boolean-expression labels like "i1&!i2" legitimately contain & and are
    // NOT gate symbols, so only exact-match labels count as DIN leftovers.
    const dinLabels = texts.filter((t) => t === '&amp;' || t === '&' || t === '≥1');
    assert.deepEqual(dinLabels, [], `${name} still renders DIN gate labels: ${dinLabels.join(', ')}`);
  }
});

test('a known gate circuit renders curved IEEE outlines', async () => {
  // lab-02/01 (XOR sum-of-products) contains AND + OR gates. With -ieee those
  // outlines are drawn with bezier curves; with DIN they are <rect> boxes.
  const file = path.join(repoRoot, 'generated', 'svg', 'simulation__lab-02__01.svg');
  const svg = await readFile(file, 'utf8').catch(() => null);
  if (svg === null) {
    assert.ok(true, 'simulation/lab-02/01 SVG not generated yet — skipped');
    return;
  }
  const paths = [...svg.matchAll(/<path[^>]*? d="([^"]+)"/g)].map((m) => m[1]);
  const curved = paths.filter((d) => /C\s/.test(d));
  assert.ok(curved.length > 0, 'gate outlines must use bezier curves (IEEE shapes), found none');
  const gateRects = [...svg.matchAll(/<rect[^>]*>/g)].filter((r) => {
    // large rects would be DIN gate bodies; small ones are pin markers
    const w = Number(r[0].match(/width="([0-9.]+)"/)?.[1] || 0);
    return w > 30;
  });
  assert.equal(gateRects.length, 0, 'DIN gate bodies (large rects) found in IEEE render');
});
