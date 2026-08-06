import { test, expect, type Page } from '@playwright/test';

interface GameLoopHandle {
  stop: () => void;
  start: () => void;
  step: (count?: number) => void;
  getTickCount: () => number;
}

// Background color of title/result screens: #1a1a2e
const BG_R = 26, BG_G = 26, BG_B = 46;

async function waitForDataLoaded(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { isDataLoaded: () => boolean } })
        .__game?.isDataLoaded() === true,
  );
}

async function hasNonBgPixel(
  page: Page,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Promise<boolean> {
  return page.evaluate(
    ({ x0, y0, x1, y1, BG_R, BG_G, BG_B }) => {
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const data = ctx.getImageData(
            Math.floor(x * dpr),
            Math.floor(y * dpr),
            1,
            1,
          ).data;
          if (data[0] !== BG_R || data[1] !== BG_G || data[2] !== BG_B) {
            return true;
          }
        }
      }
      return false;
    },
    { x0, y0, x1, y1, BG_R, BG_G, BG_B },
  );
}

test('headless idle loss on Medium with no towers placed', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await waitForDataLoaded(page);

  // Start game on Medium with Single Path map
  await page.evaluate(() => {
    (window as unknown as { __startGame: (d: string, m: string) => boolean })
      .__startGame('medium', 'map_single_path');
  });
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getState: () => string } })
        .__game?.getState() === 'WAVE_PREP',
  );

  // Stop game loop and enable 2x speed
  await page.evaluate(() => {
    (window as unknown as { __game: { toggleSpeed: () => void } }).__game.toggleSpeed();
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  // Start wave 1 WITHOUT placing any towers
  await page.evaluate(() => {
    (window as unknown as { __game: { startWave: () => void } }).__game.startWave();
  });

  // Step until defeat or victory (enemies should leak and drain lives)
  const result = await page.evaluate(() => {
    const gl = (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop;
    const game = (window as unknown as {
      __game: { getState: () => string; getCurrentWave: () => number };
    }).__game;

    for (let batch = 0; batch < 10000; batch++) {
      gl.step(600); // 600 ticks = 10s at 1x, 20s at 2x
      const state = game.getState();
      if (state === 'DEFEAT' || state === 'VICTORY') {
        return { state, wave: game.getCurrentWave(), batch };
      }
    }
    return { state: 'TIMEOUT', wave: game.getCurrentWave(), batch: 10000 };
  });

  // Assert defeat
  expect(result.state).toBe('DEFEAT');

  // Log the wave where defeat occurred
  console.log(`Defeat occurred at wave ${result.wave} after ${result.batch} batches`);

  // Verify defeat occurred within a reasonable time
  // With 15 lives on Medium and no towers, defeat should occur within ~5 waves
  expect(result.wave).toBeLessThanOrEqual(5);

  // Restart game loop to render the defeat screen
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.start();
  });
  await page.waitForTimeout(300);

  // Check for defeat screen pixels
  const hasDefeatContent = await hasNonBgPixel(page, 100, 80, 540, 200);
  expect(hasDefeatContent).toBe(true);
});

