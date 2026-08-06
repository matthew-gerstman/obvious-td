import { test, expect, type Page } from '@playwright/test';

interface GameLoopHandle {
  stop: () => void;
  step: (count?: number) => void;
  getTickCount: () => number;
}

// Title screen button centers (from title-screen.ts layout)
const EASY_BTN = { x: 160, y: 160 };
const SINGLE_PATH_BTN = { x: 480, y: 160 };
const START_BTN = { x: 320, y: 440 };

// Background color of title/result screens: #1a1a2e
const BG_R = 26, BG_G = 26, BG_B = 46;

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

async function hasNonBgPixel(page: Page, x0: number, y0: number, x1: number, y1: number): Promise<boolean> {
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

// ── Tests ────────────────────────────────────────────────────────

test('title screen renders with non-background pixels', async ({ page }) => {
  await page.goto('/');
  await waitForDataLoaded(page);

  // Wait a moment for the render loop to draw the title screen
  await page.waitForTimeout(200);

  // Check for non-background pixels in the title text area
  const hasTitle = await hasNonBgPixel(page, 100, 25, 540, 55);
  expect(hasTitle).toBe(true);

  // Check for non-background pixels in the difficulty button area
  const hasButtons = await hasNonBgPixel(page, 30, 125, 300, 200);
  expect(hasButtons).toBe(true);
});

test('selecting difficulty + map and clicking Start begins the game', async ({ page }) => {
  await page.goto('/');
  await waitForDataLoaded(page);

  // Click Easy
  await page.evaluate(({ x, y }) => {
    (window as unknown as { __titleScreen: { handleClick: (x: number, y: number) => void } })
      .__titleScreen.handleClick(x, y);
  }, EASY_BTN);

  // Click Single Path
  await page.evaluate(({ x, y }) => {
    (window as unknown as { __titleScreen: { handleClick: (x: number, y: number) => void } })
      .__titleScreen.handleClick(x, y);
  }, SINGLE_PATH_BTN);

  // Click Start
  await page.evaluate(({ x, y }) => {
    (window as unknown as { __titleScreen: { handleClick: (x: number, y: number) => void } })
      .__titleScreen.handleClick(x, y);
  }, START_BTN);

  // Verify game state is WAVE_PREP
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getState: () => string } })
        .__game?.getState() === 'WAVE_PREP',
  );

  // Verify HUD shows correct starting values for Easy
  const hud = await page.evaluate(() => {
    const eco = (window as unknown as { __economyManager: { getGold: () => number; getLives: () => number } })
      .__economyManager;
    const game = (window as unknown as { __game: { getCurrentWave: () => number } }).__game;
    return {
      gold: eco.getGold(),
      lives: eco.getLives(),
      wave: game.getCurrentWave(),
    };
  });
  expect(hud.gold).toBe(200);
  expect(hud.lives).toBe(20);
  expect(hud.wave).toBe(0);

  // Verify map renders (non-title-screen pixels in the map area)
  await page.waitForTimeout(200);
  const hasMap = await hasNonBgPixel(page, 0, 32, 640, 448);
  expect(hasMap).toBe(true);
});

test('tower appears on canvas after placement via tap', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Tap buildable tile (2, 5) to show build panel
  await page.evaluate(({ x, y }) => {
    (window as unknown as { __towerUI: { handleTileTap: (t: { x: number; y: number }) => void } })
      .__towerUI.handleTileTap({ x, y });
  }, { x: 2, y: 5 });

  // Select cannon (second row) by tapping tile (3, 7)
  await page.evaluate(({ x, y }) => {
    (window as unknown as { __towerUI: { handleTileTap: (t: { x: number; y: number }) => void } })
      .__towerUI.handleTileTap({ x, y });
  }, { x: 3, y: 7 });

  // Wait for tower sprite to appear — pixel at tower center differs from
  // the buildable background (grass + blue overlay ≈ (59, 93, 93))
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

  // Verify tower exists in manager
  const towerExists = await page.evaluate(() => {
    const manager = (window as unknown as {
      __towerManager: { getTowerAt: (x: number, y: number) => unknown };
    }).__towerManager;
    return manager.getTowerAt(2, 5) !== null;
  });
  expect(towerExists).toBe(true);
});

test('enemies spawn and move when Start Wave is clicked', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Stop the game loop for deterministic stepping
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  // Start wave 1
  await page.evaluate(() => {
    (window as unknown as { __game: { startWave: () => void } }).__game.startWave();
  });

  // Step 120 frames (2 seconds) to let enemies spawn
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

  // Record enemy position, step more, verify movement
  const pos1 = await page.evaluate(() => {
    const runner = (window as unknown as {
      __waveRunner: { getAliveEnemies: () => { x: number; y: number }[] };
    }).__waveRunner;
    const enemies = runner.getAliveEnemies();
    return enemies.length > 0 ? { x: enemies[0].x, y: enemies[0].y } : null;
  });

  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(60);
  });

  const pos2 = await page.evaluate(() => {
    const runner = (window as unknown as {
      __waveRunner: { getAliveEnemies: () => { x: number; y: number }[] };
    }).__waveRunner;
    const enemies = runner.getAliveEnemies();
    return enemies.length > 0 ? { x: enemies[0].x, y: enemies[0].y } : null;
  });

  // Enemy should have moved
  if (pos1 && pos2) {
    const moved = Math.abs(pos2.x - pos1.x) > 0.01 || Math.abs(pos2.y - pos1.y) > 0.01;
    expect(moved).toBe(true);
  }
});

test('2x speed makes enemies move faster than 1x', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Stop game loop for deterministic stepping
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  // Start wave 1
  await page.evaluate(() => {
    (window as unknown as { __game: { startWave: () => void } }).__game.startWave();
  });

  // Step 120 frames to let first enemy spawn
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(120);
  });

  // Record position at 1x, step 60 frames
  const pos1 = await page.evaluate(() => {
    const runner = (window as unknown as {
      __waveRunner: { getAliveEnemies: () => { x: number; y: number }[] };
    }).__waveRunner;
    const enemies = runner.getAliveEnemies();
    return enemies.length > 0 ? { x: enemies[0].x, y: enemies[0].y } : null;
  });

  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(60);
  });

  const pos2 = await page.evaluate(() => {
    const runner = (window as unknown as {
      __waveRunner: { getAliveEnemies: () => { x: number; y: number }[] };
    }).__waveRunner;
    const enemies = runner.getAliveEnemies();
    return enemies.length > 0 ? { x: enemies[0].x, y: enemies[0].y } : null;
  });

  // Toggle to 2x and step 60 frames (which = 120 update ticks)
  await page.evaluate(() => {
    (window as unknown as { __game: { toggleSpeed: () => void } }).__game.toggleSpeed();
  });

  const pos3_before = await page.evaluate(() => {
    const runner = (window as unknown as {
      __waveRunner: { getAliveEnemies: () => { x: number; y: number }[] };
    }).__waveRunner;
    const enemies = runner.getAliveEnemies();
    return enemies.length > 0 ? { x: enemies[0].x, y: enemies[0].y } : null;
  });

  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(60);
  });

  const pos3_after = await page.evaluate(() => {
    const runner = (window as unknown as {
      __waveRunner: { getAliveEnemies: () => { x: number; y: number }[] };
    }).__waveRunner;
    const enemies = runner.getAliveEnemies();
    return enemies.length > 0 ? { x: enemies[0].x, y: enemies[0].y } : null;
  });

  // Calculate distances moved
  if (pos1 && pos2 && pos3_before && pos3_after) {
    const dist1x = Math.hypot(pos2.x - pos1.x, pos2.y - pos1.y);
    const dist2x = Math.hypot(pos3_after.x - pos3_before.x, pos3_after.y - pos3_before.y);
    // 2x speed should move roughly twice as far (allow tolerance for path turns)
    expect(dist2x).toBeGreaterThan(dist1x * 1.5);
  }
});

test('defeat screen appears when lives reach 0', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Stop game loop for deterministic stepping
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  // Start wave 1
  await page.evaluate(() => {
    (window as unknown as { __game: { startWave: () => void } }).__game.startWave();
  });

  // Override getLives to return 0 so defeat triggers on next update
  await page.evaluate(() => {
    const eco = (window as unknown as { __economyManager: { getLives: () => number } })
      .__economyManager;
    eco.getLives = () => 0;
  });

  // Step once to trigger the defeat check
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(1);
  });

  // Verify state is DEFEAT
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getState: () => string } })
        .__game?.getState() === 'DEFEAT',
  );

  // Wait for render and check for defeat screen pixels
  await page.waitForTimeout(200);

  // Defeat screen has a dark overlay with text — check for non-bg pixels
  // in the center area where the title text appears
  const hasDefeatContent = await hasNonBgPixel(page, 100, 80, 540, 200);
  expect(hasDefeatContent).toBe(true);
});

test('victory screen appears when all 30 waves are completed', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Stop game loop for deterministic stepping
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  // Complete 30 waves by mocking the wave runner
  await page.evaluate(() => {
    const game = (window as unknown as { __game: { startWave: () => void; getState: () => string } }).__game;
    const gl = (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop;

    for (let i = 0; i < 30; i++) {
      game.startWave();
      const runner = (window as unknown as {
        __waveRunner: {
          isWaveComplete: () => boolean;
          update: () => void;
          getAliveEnemies: () => unknown[];
        };
      }).__waveRunner;
      runner.isWaveComplete = () => true;
      runner.update = () => {};
      runner.getAliveEnemies = () => [];
      gl.step(1);
    }
  });

  // Verify state is VICTORY
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getState: () => string } })
        .__game?.getState() === 'VICTORY',
  );

  // Wait for render and check for victory screen pixels
  await page.waitForTimeout(200);
  const hasVictoryContent = await hasNonBgPixel(page, 100, 80, 540, 200);
  expect(hasVictoryContent).toBe(true);
});

test('return to title from defeat screen', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Trigger defeat
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
    (window as unknown as { __game: { startWave: () => void } }).__game.startWave();
    const eco = (window as unknown as { __economyManager: { getLives: () => number } })
      .__economyManager;
    eco.getLives = () => 0;
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(1);
  });

  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getState: () => string } })
        .__game?.getState() === 'DEFEAT',
  );

  // Click Return to Title (button center: x=224+96=320, y=360+24=384)
  await page.evaluate(() => {
    (window as unknown as { __resultScreen: { handleClick: (x: number, y: number) => void } })
      .__resultScreen.handleClick(320, 384);
  });

  // Verify state is TITLE
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getState: () => string } })
        .__game?.getState() === 'TITLE',
  );
});

