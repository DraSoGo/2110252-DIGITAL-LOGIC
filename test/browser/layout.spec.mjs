import { test, expect } from '@playwright/test';

test('problem page has no horizontal document overflow', async ({ page }) => {
  await page.goto('/#/problem/simulation%2Flab-01%2F01');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
