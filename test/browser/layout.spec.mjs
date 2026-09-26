import { test, expect } from '@playwright/test';

test('problem page has no horizontal document overflow', async ({ page }) => {
  await page.goto('/#/problem/simulation%2Flab-01%2F01');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('viewer fills the active Note panel without overlapping pagination', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/#/problem/simulation%2Flab-03%2F01');
  await page.getByRole('tab', { name: /note/i }).click();
  await expect(page.locator('.note-frame iframe')).toBeVisible();
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector('#panel-note').getBoundingClientRect();
    const iframe = document.querySelector('.note-frame iframe').getBoundingClientRect();
    const pagination = document.querySelector('.problem-pagination').getBoundingClientRect();
    return { panel, iframe, pagination };
  });
  expect(geometry.iframe.height).toBeGreaterThan(300);
  expect(Math.abs(geometry.panel.bottom - geometry.iframe.bottom)).toBeLessThanOrEqual(2);
  expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.pagination.top - 8);
});

test('compact tabs are at most 40 pixels tall on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/#/problem/simulation%2Flab-01%2F01');
  await expect(page.locator('.tab-bar')).toBeVisible();
  const height = await page.locator('.tab-bar').evaluate((element) => element.clientHeight);
  expect(height).toBeLessThanOrEqual(40);
});

test('problem heading is visible and resource tabs stay compact at the left', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/#/problem/simulation%2Flab-01%2F01');

  // Problem titles come from metadata.json (statement headings) and may be
  // renamed at any time — read the live title from the manifest instead of
  // hard-coding it here.
  const expectedTitle = await page.evaluate(async () => {
    const response = await fetch(new URL('data/site.json', document.baseURI));
    const problems = await response.json();
    return problems.find((problem) => problem.id === 'simulation/lab-01/01').title;
  });
  await expect(page.getByRole('heading', { level: 1, name: expectedTitle })).toBeVisible();
  const layout = await page.evaluate(() => {
    const bar = document.querySelector('.tab-bar').getBoundingClientRect();
    const tabs = [...document.querySelectorAll('.tab-bar [role="tab"]')]
      .map((tab) => tab.getBoundingClientRect());
    return {
      titleHeight: document.querySelector('.problem-title').getBoundingClientRect().height,
      barWidth: bar.width,
      tabWidths: tabs.map((tab) => tab.width),
      occupiedWidth: tabs.at(-1).right - tabs[0].left,
    };
  });

  expect(layout.titleHeight).toBeGreaterThan(30);
  expect(Math.max(...layout.tabWidths)).toBeLessThanOrEqual(190);
  expect(layout.occupiedWidth).toBeLessThan(layout.barWidth * 0.65);
});

test('browser test server supports byte ranges required by CheerpJ', async ({ page }) => {
  const response = await page.request.get('/vendor/digital/Digital.jar', {
    headers: { Range: 'bytes=0-31' },
  });
  expect(response.status()).toBe(206);
  expect(response.headers()['accept-ranges']).toBe('bytes');
  expect(response.headers()['content-range']).toMatch(/^bytes 0-31\/\d+$/);
  expect((await response.body()).length).toBe(32);
});

test('interactive page keeps a source-download fallback when CheerpJ cannot load', async ({ page }) => {
  await page.route('**/loader.js', (route) => route.abort());
  await page.goto('/interactive.html?problem=simulation%2Flab-01%2F01');
  await expect(page.getByRole('heading', { name: 'Digital could not start' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'DOWNLOAD SOURCE .DIG' })).toHaveAttribute('href', /content\/simulation\/lab-01\/01\/solution\.dig$/);
  await expect(page.getByRole('link', { name: /RETURN TO PROBLEM/ })).toBeVisible();
});

test('interactive page preserves the project subpath in source links', async ({ page }) => {
  await page.route('**/loader.js', (route) => route.abort());
  await page.goto('/2110252-DIGITAL-LOGIC/interactive.html?problem=simulation%2Flab-01%2F01');
  await expect(page.getByRole('heading', { name: 'Digital could not start' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'DOWNLOAD SOURCE .DIG' })).toHaveAttribute('href', /2110252-DIGITAL-LOGIC\/content\/simulation\/lab-01\/01\/solution\.dig$/);
});

test('hidden interactive fallback never blocks pointer input to the Java canvas', async ({ page }) => {
  await page.route('**/loader.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `
      window.cheerpjInit = async () => {};
      window.cheerpOSAddStringFile = () => {};
      window.cheerpjCreateDisplay = (_width, _height, host) => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        host.append(canvas);
      };
      window.cheerpjRunJar = () => new Promise(() => {});
    `,
  }));
  await page.goto('/interactive.html?problem=simulation%2Flab-01%2F01');
  await expect(page.locator('#interactive-status')).toHaveText(/INTERACTIVE/);

  const canvasReceivesPointer = await page.evaluate(() => {
    const canvas = document.querySelector('#digital-display canvas');
    const rect = canvas.getBoundingClientRect();
    return document.elementFromPoint(rect.left + 10, rect.top + 10) === canvas;
  });
  expect(canvasReceivesPointer).toBe(true);
});
