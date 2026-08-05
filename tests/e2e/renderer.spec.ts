import { test, expect } from '@playwright/test';

interface GameLoopHandle {
  stop: () => void;
  step: (count?: number) => void;
  getTickCount: () => number;
}

test('canvas exists with touch-action: none', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('#game');
  await expect(canvas).toBeVisible();
  const touchAction = await canvas.evaluate(
    (el) => getComputedStyle(el).touchAction,
  );
  expect(touchAction).toBe('none');
});

test('sprite blits to expected pixel region', async ({ page }) => {
  await page.goto('/');

  // Wait for the sprite to be drawn at logical (0, 0)
  await page.waitForFunction(() => {
    const canvas = document.getElementById('game') as HTMLCanvasElement | null;
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const dpr = window.devicePixelRatio || 1;
    const data = ctx.getImageData(
      Math.floor(5 * dpr),
      Math.floor(5 * dpr),
      1,
      1,
    ).data;
    return data[0] !== 0 && data[3] !== 0;
  });

  // Verify the sprite pixel color at (5, 5) — should be #4a90d9
  const spritePixel = await page.evaluate(() => {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const data = ctx.getImageData(
      Math.floor(5 * dpr),
      Math.floor(5 * dpr),
      1,
      1,
    ).data;
    return {
      r: data[0] ?? 0,
      g: data[1] ?? 0,
      b: data[2] ?? 0,
      a: data[3] ?? 0,
    };
  });
  expect(spritePixel.r).toBe(74);
  expect(spritePixel.g).toBe(144);
  expect(spritePixel.b).toBe(217);
  expect(spritePixel.a).toBe(255);
});

test('drawRect renders at expected pixel region', async ({ page }) => {
  await page.goto('/');

  // Wait for the rect to be drawn at logical (64, 0)
  await page.waitForFunction(() => {
    const canvas = document.getElementById('game') as HTMLCanvasElement | null;
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const dpr = window.devicePixelRatio || 1;
    const data = ctx.getImageData(
      Math.floor(69 * dpr),
      Math.floor(5 * dpr),
      1,
      1,
    ).data;
    return data[0] !== 0 && data[3] !== 0;
  });

  // Verify the rect pixel color at (69, 5) — should be #ff6b6b
  const rectPixel = await page.evaluate(() => {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const data = ctx.getImageData(
      Math.floor(69 * dpr),
      Math.floor(5 * dpr),
      1,
      1,
    ).data;
    return {
      r: data[0] ?? 0,
      g: data[1] ?? 0,
      b: data[2] ?? 0,
      a: data[3] ?? 0,
    };
  });
  expect(rectPixel.r).toBe(255);
  expect(rectPixel.g).toBe(107);
  expect(rectPixel.b).toBe(107);
  expect(rectPixel.a).toBe(255);
});

test('game loop advances a deterministic tick count', async ({ page }) => {
  await page.goto('/');

  await page.waitForFunction(
    () =>
      (window as unknown as { __gameLoop?: unknown }).__gameLoop !== undefined,
  );

  const result = await page.evaluate(() => {
    const loop = (
      window as unknown as { __gameLoop: GameLoopHandle }
    ).__gameLoop;
    loop.stop();
    const before = loop.getTickCount();
    loop.step(100);
    const after = loop.getTickCount();
    return { before, after, delta: after - before };
  });

  expect(result.delta).toBe(100);
});

test('game loop tick count is deterministic across runs', async ({ page }) => {
  await page.goto('/');

  await page.waitForFunction(
    () =>
      (window as unknown as { __gameLoop?: unknown }).__gameLoop !== undefined,
  );

  const run1 = await page.evaluate(() => {
    const loop = (
      window as unknown as { __gameLoop: GameLoopHandle }
    ).__gameLoop;
    loop.stop();
    loop.step(60);
    return loop.getTickCount();
  });

  const run2 = await page.evaluate(() => {
    const loop = (
      window as unknown as { __gameLoop: GameLoopHandle }
    ).__gameLoop;
    loop.step(60);
    return loop.getTickCount();
  });

  // Each step(60) advances exactly 60 ticks — deterministic
  expect(run2 - run1).toBe(60);
});
