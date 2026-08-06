import { test, expect, type Page } from '@playwright/test';

interface GameLoopHandle {
  stop: () => void;
  step: (count?: number) => void;
  getTickCount: () => number;
}

interface StrategyHint {
  enemyId: string;
  enemyName: string;
  counters: string[];
  isCritical: boolean;
  warningText: string | null;
}

interface StrategyHintResult {
  hints: StrategyHint[];
  hasCritical: boolean;
}

async function waitForDataLoaded(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { isDataLoaded: () => boolean } })
        .__game?.isDataLoaded() === true,
  );
}

async function startGame(
  page: Page,
  difficulty = 'easy',
  mapId = 'map_single_path',
): Promise<void> {
  await waitForDataLoaded(page);
  await page.evaluate(
    ({ difficulty, mapId }) => {
      (window as unknown as {
        __startGame: (d: string, m: string) => boolean;
      }).__startGame(difficulty, mapId);
    },
    { difficulty, mapId },
  );
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getState: () => string } })
        .__game?.getState() === 'WAVE_PREP',
  );
}

/**
 * Check for pixels matching a target color (within tolerance) in a region.
 * Used to detect the strategy hint panel border and critical warning text.
 */
async function hasColorPixel(
  page: Page,
  x0: number,
  y0: number,
  x1: number,
 y1: number,
  r: number,
  g: number,
  b: number,
): Promise<boolean> {
  return page.evaluate(
    ({ x0, y0, x1, y1, r, g, b }) => {
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
          if (
            Math.abs(data[0] - r) < 30 &&
            Math.abs(data[1] - g) < 30 &&
            Math.abs(data[2] - b) < 30 &&
            data[3] > 200
          ) {
            return true;
          }
        }
      }
      return false;
    },
    { x0, y0, x1, y1, r, g, b },
  );
}

/** Complete waves 1 through N by mocking the wave runner. */
async function completeWaves(page: Page, count: number): Promise<void> {
 await page.evaluate((count) => {
    const game = (window as unknown as { __game: { startWave: () => void } }).__game;
    const runner = (window as unknown as {
      __waveRunner: {
        isWaveComplete: () => boolean;
        update: () => void;
        getAliveEnemies: () => unknown[];
      };
    }).__waveRunner;
    const gl = (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop;
    gl.stop();
    for (let i = 0; i < count; i++) {
      game.startWave();
      runner.isWaveComplete = () => true;
      runner.update = () => {};
      runner.getAliveEnemies = () => [];
      gl.step(1);
    }
  }, count);
}

// Strategy hint panel area — x=8-308, y=82-280
// Border color: #4a90d9 = RGB(74, 144, 217)
// Critical warning text: #ff4444 = RGB(255, 68, 68)
const PANEL_X0 = 8;
const PANEL_X1 = 308;
const PANEL_BORDER_Y0 = 82;
const PANEL_BORDER_Y1 = 85;

const BORDER_R = 74;
const BORDER_G = 144;
const BORDER_B = 217;

// ── Tests ────────────────────────────────────────────────────────

test('strategy hint panel appears during WAVE_PREP', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Wait for render
  await page.waitForTimeout(200);

  // Check for panel border (blue) in the top border area
  const hasBorder = await hasColorPixel(
    page,
    PANEL_X0,
    PANEL_BORDER_Y0,
    PANEL_X1,
    PANEL_BORDER_Y1,
    BORDER_R,
    BORDER_G,
    BORDER_B,
  );
  expect(hasBorder).toBe(true);

  // Verify hints data is available via the game API
  const hints = await page.evaluate(() => {
    const game = (window as unknown as {
      __game: { getStrategyHints: () => StrategyHintResult | null };
    }).__game;
    return game.getStrategyHints();
  });
  expect(hints).not.toBeNull();
  expect(hints!.hints.length).toBeGreaterThan(0);

  // Wave 1 is grunts only — no critical warnings
  expect(hints!.hasCritical).toBe(false);
});

test('strategy hint panel disappears when wave starts', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Wait for render — panel should be visible
  await page.waitForTimeout(200);

  const hasBorderBefore = await hasColorPixel(
    page,
    PANEL_X0,
    PANEL_BORDER_Y0,
    PANEL_X1,
    PANEL_BORDER_Y1,
    BORDER_R,
    BORDER_G,
    BORDER_B,
  );
  expect(hasBorderBefore).toBe(true);

  // Start the wave — transition to WAVE_ACTIVE
  await page.evaluate(() => {
    (window as unknown as { __game: { startWave: () => void } }).__game.startWave();
  });

  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getState: () => string } })
        .__game?.getState() === 'WAVE_ACTIVE',
  );

  // Wait for render — panel should be gone
  await page.waitForTimeout(200);

  const hasBorderAfter = await hasColorPixel(
    page,
    PANEL_X0,
    PANEL_BORDER_Y0,
    PANEL_X1,
    PANEL_BORDER_Y1,
    BORDER_R,
    BORDER_G,
    BORDER_B,
  );
  expect(hasBorderAfter).toBe(false);

  // Hints should be null during WAVE_ACTIVE
  const hints = await page.evaluate(() => {
    const game = (window as unknown as {
      __game: { getStrategyHints: () => StrategyHintResult | null };
    }).__game;
    return game.getStrategyHints();
  });
  expect(hints).toBeNull();
});

test('critical warning appears for flyers when no anti-air towers placed', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Complete waves 1-5 to reach WAVE_PREP for wave 6 (has flyers)
  await completeWaves(page, 5);

  // Verify we're in WAVE_PREP for wave 6
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getState: () => string; getCurrentWave: () => number } })
        .__game?.getCurrentWave() === 5,
  );

  // Wait for render
  await page.waitForTimeout(200);

  // Verify hints data shows critical for flyers
  const hints = await page.evaluate(() => {
    const game = (window as unknown as {
      __game: { getStrategyHints: () => StrategyHintResult | null };
    }).__game;
    return game.getStrategyHints();
  });
  expect(hints).not.toBeNull();
  expect(hints!.hasCritical).toBe(true);

  const flyerHint = hints!.hints.find((h) => h.enemyId === 'enemy_flyer');
  expect(flyerHint).toBeDefined();
  expect(flyerHint!.isCritical).toBe(true);
  expect(flyerHint!.warningText).toContain('anti-air');

  // Data-level verification confirms the critical warning is generated.
  // Pixel-level verification of the panel border is covered by the
  // 'strategy hint panel appears during WAVE_PREP' test above.
});

test('critical warning clears when anti-air tower is built during prep', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Complete waves 1-5 to reach WAVE_PREP for wave 6 (has flyers)
  await completeWaves(page, 5);

  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getCurrentWave: () => number } })
        .__game?.getCurrentWave() === 5,
  );

  // Wait for render — flyer should be critical
  await page.waitForTimeout(200);

  const hintsBefore = await page.evaluate(() => {
    const game = (window as unknown as {
      __game: { getStrategyHints: () => StrategyHintResult | null };
    }).__game;
    return game.getStrategyHints();
  });
  const flyerBefore = hintsBefore!.hints.find((h) => h.enemyId === 'enemy_flyer');
  expect(flyerBefore!.isCritical).toBe(true);

  // Build a cannon tower (has hitsAir=true) via tower UI
  await page.evaluate(({ x, y }) => {
    (window as unknown as { __towerUI: { handleTileTap: (t: { x: number; y: number }) => void } })
      .__towerUI.handleTileTap({ x, y });
  }, { x: 2, y: 5 });

  // Select cannon (second row in build panel)
  await page.evaluate(({ x, y }) => {
    (window as unknown as { __towerUI: { handleTileTap: (t: { x: number; y: number }) => void } })
      .__towerUI.handleTileTap({ x, y });
  }, { x: 3, y: 7 });

  // Wait for render — hints should update
  await page.waitForTimeout(200);

  // Verify flyer is no longer critical
  const hintsAfter = await page.evaluate(() => {
    const game = (window as unknown as {
      __game: { getStrategyHints: () => StrategyHintResult | null };
    }).__game;
    return game.getStrategyHints();
  });
  const flyerAfter = hintsAfter!.hints.find((h) => h.enemyId === 'enemy_flyer');
  expect(flyerAfter).toBeDefined();
  expect(flyerAfter!.isCritical).toBe(false);
  expect(flyerAfter!.warningText).toBeNull();
});

test('strategy hints show correct enemy types for wave 1', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  await page.waitForTimeout(200);

  const hints = await page.evaluate(() => {
    const game = (window as unknown as {
      __game: { getStrategyHints: () => StrategyHintResult | null };
    }).__game;
    return game.getStrategyHints();
  });

  expect(hints).not.toBeNull();
  expect(hints!.hints).toHaveLength(1);
  expect(hints!.hints[0].enemyId).toBe('enemy_grunt');
  expect(hints!.hints[0].enemyName).toBe('Grunt');
});

test('strategy hints show multiple enemy types for mixed waves', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Complete waves 1-5 to reach WAVE_PREP for wave 6 (grunt + flyer)
  await completeWaves(page, 5);

  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getCurrentWave: () => number } })
        .__game?.getCurrentWave() === 5,
  );

  await page.waitForTimeout(200);

  const hints = await page.evaluate(() => {
    const game = (window as unknown as {
      __game: { getStrategyHints: () => StrategyHintResult | null };
    }).__game;
    return game.getStrategyHints();
  });

  expect(hints).not.toBeNull();
  expect(hints!.hints).toHaveLength(2);
  const ids = hints!.hints.map((h) => h.enemyId);
  expect(ids).toContain('enemy_grunt');
  expect(ids).toContain('enemy_flyer');
});

