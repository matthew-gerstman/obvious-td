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

  // Stop the game loop so we can draw directly on the canvas
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  // Draw a sprite at (0, 0) and verify the pixel
  const spritePixel = await page.evaluate(async () => {
    const { createSolidColorSprite } = await import('/src/renderer/sprite-loader.ts');
    const { Renderer } = await import('/src/renderer/renderer.ts');
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    const sprite = createSolidColorSprite(32, 32, '#4a90d9');
    renderer.clear();
    renderer.drawSprite(sprite, 0, 0);
    const dpr = window.devicePixelRatio || 1;
    const data = canvas.getContext('2d')!.getImageData(
      Math.floor(5 * dpr), Math.floor(5 * dpr), 1, 1,
    ).data;
    return { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0, a: data[3] ?? 0 };
  });
  expect(spritePixel.r).toBe(74);
  expect(spritePixel.g).toBe(144);
  expect(spritePixel.b).toBe(217);
  expect(spritePixel.a).toBe(255);
});

test('drawRect renders at expected pixel region', async ({ page }) => {
  await page.goto('/');

  // Stop the game loop so we can draw directly on the canvas
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  // Draw a rect at (64, 0) and verify the pixel
  const rectPixel = await page.evaluate(async () => {
    const { Renderer } = await import('/src/renderer/renderer.ts');
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.clear();
    renderer.drawRect(64, 0, 32, 32, '#ff6b6b');
    const dpr = window.devicePixelRatio || 1;
    const data = canvas.getContext('2d')!.getImageData(
      Math.floor(69 * dpr), Math.floor(5 * dpr), 1, 1,
    ).data;
    return { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0, a: data[3] ?? 0 };
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

test('drawCircle renders filled pixels at center', async ({ page }) => {
  await page.goto('/');

  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  const circlePixel = await page.evaluate(async () => {
    const { Renderer } = await import('/src/renderer/renderer.ts');
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.clear();
    renderer.drawCircle(48, 48, 20, '#4a90d9');
    const dpr = window.devicePixelRatio || 1;
    const data = canvas.getContext('2d')!.getImageData(
      Math.floor(48 * dpr), Math.floor(48 * dpr), 1, 1,
    ).data;
    return { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0, a: data[3] ?? 0 };
  });
  expect(circlePixel.r).toBe(74);
  expect(circlePixel.g).toBe(144);
  expect(circlePixel.b).toBe(217);
  expect(circlePixel.a).toBe(255);
});

test('drawCircle leaves pixels transparent outside radius', async ({ page }) => {
  await page.goto('/');

  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  const outsidePixel = await page.evaluate(async () => {
    const { Renderer } = await import('/src/renderer/renderer.ts');
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.clear();
    // Circle at (48, 48) with radius 10 — pixel at (100, 100) should be outside
    renderer.drawCircle(48, 48, 10, '#4a90d9');
    const dpr = window.devicePixelRatio || 1;
    const data = canvas.getContext('2d')!.getImageData(
      Math.floor(100 * dpr), Math.floor(100 * dpr), 1, 1,
    ).data;
    return { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0, a: data[3] ?? 0 };
  });
  expect(outsidePixel.a).toBe(0);
});

test('drawStrokeRect renders border pixels but not interior', async ({ page }) => {
  await page.goto('/');

  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  const result = await page.evaluate(async () => {
    const { Renderer } = await import('/src/renderer/renderer.ts');
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.clear();
    // Stroked rect at (64, 32) size 32x32, lineWidth 2 — offset from canvas edge
    // so the full stroke width is within the canvas
    renderer.drawStrokeRect(64, 32, 32, 32, '#ff6b6b', 2);
    const dpr = window.devicePixelRatio || 1;
    // Border pixel at (70, 32) — on the top-edge path (center of 2px stroke)
    const borderData = canvas.getContext('2d')!.getImageData(
      Math.floor(70 * dpr), Math.floor(32 * dpr), 1, 1,
    ).data;
    // Interior pixel at (80, 48) — center of rect, should be transparent
    const interiorData = canvas.getContext('2d')!.getImageData(
      Math.floor(80 * dpr), Math.floor(48 * dpr), 1, 1,
    ).data;
    return {
      border: { r: borderData[0] ?? 0, g: borderData[1] ?? 0, b: borderData[2] ?? 0, a: borderData[3] ?? 0 },
      interior: { r: interiorData[0] ?? 0, g: interiorData[1] ?? 0, b: interiorData[2] ?? 0, a: interiorData[3] ?? 0 },
    };
  });
  // Border should have the stroke color
  expect(result.border.r).toBe(255);
  expect(result.border.g).toBe(107);
  expect(result.border.b).toBe(107);
  expect(result.border.a).toBe(255);
  // Interior should be transparent (no fill)
  expect(result.interior.a).toBe(0);
});

test('drawLine renders pixels along the segment', async ({ page }) => {
  await page.goto('/');

  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  const linePixel = await page.evaluate(async () => {
    const { Renderer } = await import('/src/renderer/renderer.ts');
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.clear();
    // Horizontal line from (0, 48) to (100, 48)
    renderer.drawLine(0, 48, 100, 48, '#4a90d9', 2);
    const dpr = window.devicePixelRatio || 1;
    const data = canvas.getContext('2d')!.getImageData(
      Math.floor(50 * dpr), Math.floor(48 * dpr), 1, 1,
    ).data;
    return { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0, a: data[3] ?? 0 };
  });
  expect(linePixel.r).toBe(74);
  expect(linePixel.g).toBe(144);
  expect(linePixel.b).toBe(217);
  expect(linePixel.a).toBe(255);
});

test('drawLine leaves pixels transparent off the segment', async ({ page }) => {
  await page.goto('/');

  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  const offLinePixel = await page.evaluate(async () => {
    const { Renderer } = await import('/src/renderer/renderer.ts');
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.clear();
    // Horizontal line at y=48 — pixel at y=100 should be transparent
    renderer.drawLine(0, 48, 100, 48, '#4a90d9', 2);
    const dpr = window.devicePixelRatio || 1;
    const data = canvas.getContext('2d')!.getImageData(
      Math.floor(50 * dpr), Math.floor(100 * dpr), 1, 1,
    ).data;
    return { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0, a: data[3] ?? 0 };
  });
  expect(offLinePixel.a).toBe(0);
});

test('imageSmoothingEnabled is false after resize', async ({ page }) => {
  await page.goto('/');

  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  const smoothing = await page.evaluate(async () => {
    const { Renderer } = await import('/src/renderer/renderer.ts');
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    return canvas.getContext('2d')!.imageSmoothingEnabled;
  });
  expect(smoothing).toBe(false);
});

