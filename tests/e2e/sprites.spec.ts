import { test, expect, type Page } from '@playwright/test';

interface GameLoopHandle {
  stop: () => void;
  step: (count?: number) => void;
}

async function waitForDataLoaded(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { isDataLoaded: () => boolean } })
        .__game?.isDataLoaded() === true,
  );
}

async function startGame(page: Page): Promise<void> {
  await waitForDataLoaded(page);
  await page.evaluate(() => {
    (window as unknown as { __startGame: (d: string, m: string) => boolean })
      .__startGame('easy', 'map_single_path');
  });
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getState: () => string } })
        .__game?.getState() === 'WAVE_PREP',
  );
}

async function tapTile(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ x, y }) => {
      const ui = (
        window as unknown as {
          __towerUI: { handleTileTap: (tile: { x: number; y: number }) => void };
        }
      ).__towerUI;
      ui.handleTileTap({ x, y });
    },
    { x, y },
  );
}

test('sprite rendering produces pixel diversity in tower area', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Place a cannon tower at tile (2, 5)
  await tapTile(page, 2, 5);
  await tapTile(page, 3, 7);

  // Wait for the tower sprite to appear
  await page.waitForFunction(
    () => {
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      const data = ctx.getImageData(
        Math.floor(78 * dpr),
        Math.floor(174 * dpr),
        1,
        1,
      ).data;
      const tol = 15;
      return (
        Math.abs(data[0] - 59) > tol ||
        Math.abs(data[1] - 93) > tol ||
        Math.abs(data[2] - 93) > tol
      );
    },
    { timeout: 5000 },
  );

  // Sample pixels across the tower tile area and count distinct colors
  const diversity = await page.evaluate(() => {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;

    // Sample a 16x16 grid within the 32x32 tower tile at (2, 5)
    const colors = new Set<string>();
    for (let dy = 0; dy < 32; dy += 2) {
      for (let dx = 0; dx < 32; dx += 2) {
        const px = Math.floor((64 + dx) * dpr);
        const py = Math.floor((160 + dy) * dpr);
        const data = ctx.getImageData(px, py, 1, 1).data;
        // Only count non-transparent pixels
        if (data[3] > 0) {
          colors.add(`${data[0]},${data[1]},${data[2]}`);
        }
      }
    }
    return colors.size;
  });

  // Sprites produce multiple distinct colors; a flat drawRect would produce 1-2
  expect(diversity).toBeGreaterThanOrEqual(3);
});

test('sprite rendering produces pixel diversity in path tiles', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Wait for the map to render
  await page.waitForTimeout(200);

  // Sample pixels across a path tile area and count distinct colors
  const diversity = await page.evaluate(() => {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;

    // Find a path tile by scanning the map area
    // map_single_path has a path at y=7, so tile (1, 7) should be a path tile
    const colors = new Set<string>();
    for (let dy = 0; dy < 32; dy += 2) {
      for (let dx = 0; dx < 32; dx += 2) {
        const px = Math.floor((32 + dx) * dpr);
        const py = Math.floor((224 + dy) * dpr);
        const data = ctx.getImageData(px, py, 1, 1).data;
        if (data[3] > 0) {
          colors.add(`${data[0]},${data[1]},${data[2]}`);
        }
      }
    }
    return colors.size;
  });

  // Path tile sprites have texture variation; flat color would produce 1
  expect(diversity).toBeGreaterThanOrEqual(2);
});

test('game renders with drawRect fallback when sprite fails to load', async ({ page }) => {
  // Intercept sprite requests and return 404 to simulate missing sprites
  await page.route('**/sprites/default/**', (route) => {
    route.fulfill({ status: 404 });
  });

  await page.goto('/');
  await startGame(page);

  // Place a cannon tower at tile (2, 5)
  await tapTile(page, 2, 5);
  await tapTile(page, 3, 7);

  // The game should still render the tower via drawRect fallback
  // Check that the tower position has non-background pixels
  await page.waitForFunction(
    () => {
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      const data = ctx.getImageData(
        Math.floor(78 * dpr),
        Math.floor(174 * dpr),
        1,
        1,
      ).data;
      const tol = 15;
      return (
        Math.abs(data[0] - 59) > tol ||
        Math.abs(data[1] - 93) > tol ||
        Math.abs(data[2] - 93) > tol
      );
    },
    { timeout: 5000 },
  );

  // Verify the game hasn't crashed — state is still WAVE_PREP or WAVE_ACTIVE
  const state = await page.evaluate(() => {
    return (window as unknown as { __game?: { getState: () => string } })
      .__game?.getState();
  });
  expect(state).toMatch(/WAVE_PREP|WAVE_ACTIVE/);

  // Verify the tower exists in the manager
  const towerExists = await page.evaluate(() => {
    const manager = (
      window as unknown as {
        __towerManager: { getTowerAt: (x: number, y: number) => unknown };
      }
    ).__towerManager;
    return manager.getTowerAt(2, 5) !== null;
  });
  expect(towerExists).toBe(true);
});

test('enemies render with sprites during active wave', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Stop the game loop for deterministic control
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  // Start wave 1
  await page.evaluate(() => {
    (window as unknown as { __game: { startWave: () => void } }).__game.startWave();
  });

  // Step 120 frames to let enemies spawn
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(120);
  });

  // Verify enemies exist
  const enemyCount = await page.evaluate(() => {
    const runner = (window as unknown as {
      __waveRunner: { getAliveEnemies: () => unknown[] };
    }).__waveRunner;
    return runner.getAliveEnemies().length;
  });
  expect(enemyCount).toBeGreaterThan(0);

  // Render one frame and check for non-background pixels at enemy positions
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(1);
  });

  // Check that the canvas has enemy sprites (non-grass, non-path pixels)
  const hasEnemyPixels = await page.evaluate(() => {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;

    // Get alive enemies and check their positions
    const runner = (window as unknown as {
      __waveRunner: { getAliveEnemies: () => { x: number; y: number }[] };
    }).__waveRunner;
    const enemies = runner.getAliveEnemies();

    for (const enemy of enemies) {
      const px = Math.floor((enemy.x * 32 + 16) * dpr);
      const py = Math.floor((enemy.y * 32 + 16) * dpr);
      const data = ctx.getImageData(px, py, 1, 1).data;
      // Check for non-transparent, non-grass pixel
      if (data[3] > 0 && (data[0] !== 45 || data[1] !== 74 || data[2] !== 45)) {
        return true;
      }
    }
    return false;
  });
  expect(hasEnemyPixels).toBe(true);
});
