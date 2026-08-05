import { test, expect, type Page } from '@playwright/test';

// Enable touch support for the browser context (Desktop Chrome disables it by default).
// Mouse tests are unaffected — hasTouch only adds touch capability.
test.use({ hasTouch: true });

interface InputTestHook {
  lastTap: { x: number; y: number } | null;
  lastHover: { x: number; y: number } | null;
  lastDragStart: { x: number; y: number } | null;
  lastDragMove: { x: number; y: number } | null;
  lastDragEnd: { x: number; y: number } | null;
}

/**
 * Compute the screen position for the center of a given tile.
 * Accounts for the canvas bounding rect and DPR scaling.
 */
async function tileCenterScreenPosition(
  page: Page,
  tileX: number,
  tileY: number,
  tileSize = 32,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    (args: { tileX: number; tileY: number; tileSize: number }) => {
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const logicalWidth = canvas.width / dpr;
      const logicalHeight = canvas.height / dpr;
      const scaleX = rect.width / logicalWidth;
      const scaleY = rect.height / logicalHeight;
      return {
        x: rect.left + (args.tileX * args.tileSize + args.tileSize / 2) * scaleX,
        y: rect.top + (args.tileY * args.tileSize + args.tileSize / 2) * scaleY,
      };
    },
    { tileX, tileY, tileSize },
  );
}

/** Read the input test hook from the page. */
async function getInputState(page: Page): Promise<InputTestHook> {
  return page.evaluate(() => {
    return (window as unknown as { __inputTestHook: InputTestHook })
      .__inputTestHook;
  });
}

test('canvas has touch-action: none', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('#game');
  await expect(canvas).toBeVisible();
  const touchAction = await canvas.evaluate(
    (el) => getComputedStyle(el).touchAction,
  );
  expect(touchAction).toBe('none');
});

test('mouse click fires onTileTap with correct tile coordinates', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as unknown as { __inputTestHook?: unknown }).__inputTestHook !==
      undefined,
  );

  const pos = await tileCenterScreenPosition(page, 2, 3);
  await page.mouse.click(pos.x, pos.y);

  const state = await getInputState(page);
  expect(state.lastTap).toEqual({ x: 2, y: 3 });
});

test('touch tap fires onTileTap with correct tile coordinates', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as unknown as { __inputTestHook?: unknown }).__inputTestHook !==
      undefined,
  );

  const pos = await tileCenterScreenPosition(page, 4, 1);
  await page.touchscreen.tap(pos.x, pos.y);

  const state = await getInputState(page);
  expect(state.lastTap).toEqual({ x: 4, y: 1 });
});

test('mouse hover fires onTileHover with correct tile coordinates', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as unknown as { __inputTestHook?: unknown }).__inputTestHook !==
      undefined,
  );

  const pos = await tileCenterScreenPosition(page, 3, 2);
  await page.mouse.move(pos.x, pos.y);

  const state = await getInputState(page);
  expect(state.lastHover).toEqual({ x: 3, y: 2 });
});

test('input manager does not throw when PointerEvent is undefined', async ({ page }) => {
  // Delete PointerEvent before any scripts run so the InputManager
  // falls back to the touch + mouse path.
  await page.addInitScript(() => {
    delete (window as unknown as { PointerEvent?: unknown }).PointerEvent;
  });
  await page.goto('/');

  // Page loaded without errors — InputManager constructor did not throw
  await expect(page.locator('#game')).toBeVisible();
  await page.waitForFunction(
    () =>
      (window as unknown as { __inputTestHook?: unknown }).__inputTestHook !==
      undefined,
  );

  // Mouse click still works via the fallback path
  const pos = await tileCenterScreenPosition(page, 1, 1);
  await page.mouse.click(pos.x, pos.y);

  const state = await getInputState(page);
  expect(state.lastTap).toEqual({ x: 1, y: 1 });
});
