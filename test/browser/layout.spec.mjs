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
