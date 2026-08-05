import { test, expect } from '@playwright/test';

test('page loads and displays title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle("Don't Let the Demons Into Heaven");
});

test('canvas element is present', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('#game');
  await expect(canvas).toBeVisible();
});

