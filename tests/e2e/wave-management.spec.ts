import { test, expect, type Page } from '@playwright/test';

interface GameLoopHandle {
  stop: () => void;
  step: (count?: number) => void;
  getTickCount: () => number;
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

/** Check for non-background pixels in a region of the canvas. */
async function hasNonBgPixel(
  page: Page,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Promise<boolean> {
  return page.evaluate(
    ({ x0, y0, x1, y1 }) => {
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
          // Fully transparent pixel = nothing drawn
          if (data[3] > 0) return true;
        }
      }
      return false;
    },
    { x0, y0, x1, y1 },
  );
}

/** Check if a specific region has bright text pixels (e.g. PAUSED overlay text). */
async function hasBrightText(
  page: Page,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Promise<boolean> {
  return page.evaluate(
    ({ x0, y0, x1, y1 }) => {
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
          // White text pixels: high R, G, B with full alpha
          if (data[0] > 200 && data[1] > 200 && data[2] > 200 && data[3] > 200) {
            return true;
          }
        }
      }
      return false;
    },
    { x0, y0, x1, y1 },
  );
}

// ── Tests ────────────────────────────────────────────────────────

test('wave preview shows next wave composition during WAVE_PREP', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Wait for render
  await page.waitForTimeout(200);

  // Wave preview text is rendered below the top bar (y=36-60)
  // Check for non-transparent pixels in that area
  const hasPreview = await hasNonBgPixel(page, 10, 36, 400, 60);
  expect(hasPreview).toBe(true);
});

test('wave 1 has no auto-start countdown (requires manual start)', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Stop the game loop and step past the auto-start delay
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  // Step 600 frames (10 seconds) — wave 1 should NOT auto-start
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(600);
  });

  // Verify still in WAVE_PREP with wave 0
  const state = await page.evaluate(() => {
    const game = (window as unknown as { __game: { getState: () => string; getCurrentWave: () => number } }).__game;
    return { state: game.getState(), wave: game.getCurrentWave() };
  });
  expect(state.state).toBe('WAVE_PREP');
  expect(state.wave).toBe(0);
});

test('auto-start countdown appears for wave 2+', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Stop game loop for deterministic control
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  // Start and complete wave 1
  await page.evaluate(() => {
    const game = (window as unknown as { __game: { startWave: () => void } }).__game;
    const runner = (window as unknown as {
      __waveRunner: {
        isWaveComplete: () => boolean;
        update: () => void;
        getAliveEnemies: () => unknown[];
      };
    }).__waveRunner;
    game.startWave();
    runner.isWaveComplete = () => true;
    runner.update = () => {};
    runner.getAliveEnemies = () => [];
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(1);
  });

  // Verify in WAVE_PREP for wave 2
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getState: () => string; getCurrentWave: () => number } })
        .__game?.getCurrentWave() === 1,
  );

  // Step 120 frames (2 seconds) into the countdown
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(120);
  });

  // Verify prep timer is advancing (countdown is active)
  const prepTimer = await page.evaluate(() => {
    return (window as unknown as { __game: { getPrepTimer: () => number } }).__game.getPrepTimer();
  });
  expect(prepTimer).toBeGreaterThan(0);

  // Verify auto-start is enabled
  const autoStart = await page.evaluate(() => {
    return (window as unknown as { __game: { isAutoStartEnabled: () => boolean } }).__game.isAutoStartEnabled();
  });
  expect(autoStart).toBe(true);
});

test('auto-start toggle OFF prevents auto-start for wave 2', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Stop game loop
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  // Start and complete wave 1
  await page.evaluate(() => {
    const game = (window as unknown as { __game: { startWave: () => void } }).__game;
    const runner = (window as unknown as {
      __waveRunner: {
        isWaveComplete: () => boolean;
        update: () => void;
        getAliveEnemies: () => unknown[];
      };
    }).__waveRunner;
    game.startWave();
    runner.isWaveComplete = () => true;
    runner.update = () => {};
    runner.getAliveEnemies = () => [];
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(1);
  });

  // Toggle auto-start OFF
  await page.evaluate(() => {
    (window as unknown as { __game: { toggleAutoStart: () => void } }).__game.toggleAutoStart();
  });

  // Step 900 frames (15 seconds) — should NOT auto-start
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(900);
  });

  // Verify still in WAVE_PREP
  const state = await page.evaluate(() => {
    const game = (window as unknown as { __game: { getState: () => string; getCurrentWave: () => number } }).__game;
    return { state: game.getState(), wave: game.getCurrentWave() };
  });
  expect(state.state).toBe('WAVE_PREP');
  expect(state.wave).toBe(1);
});

test('auto-start toggle ON auto-starts wave 2 after countdown', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Stop game loop
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  // Start and complete wave 1
  await page.evaluate(() => {
    const game = (window as unknown as { __game: { startWave: () => void } }).__game;
    const runner = (window as unknown as {
      __waveRunner: {
        isWaveComplete: () => boolean;
        update: () => void;
        getAliveEnemies: () => unknown[];
      };
    }).__waveRunner;
    game.startWave();
    runner.isWaveComplete = () => true;
    runner.update = () => {};
    runner.getAliveEnemies = () => [];
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(1);
  });

  // Auto-start is ON by default — step 600 frames (10 seconds)
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(600);
  });

  // Verify wave 2 auto-started
  const state = await page.evaluate(() => {
    const game = (window as unknown as { __game: { getState: () => string; getCurrentWave: () => number } }).__game;
    return { state: game.getState(), wave: game.getCurrentWave() };
  });
  expect(state.state).toBe('WAVE_ACTIVE');
  expect(state.wave).toBe(2);
});

test('pause button shows PAUSED overlay on canvas', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Start wave 1 to enter WAVE_ACTIVE (keep render loop running so overlay draws)
  await page.evaluate(() => {
    (window as unknown as { __game: { startWave: () => void } }).__game.startWave();
  });

  // Wait for WAVE_ACTIVE
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getState: () => string } })
        .__game?.getState() === 'WAVE_ACTIVE',
  );

  // Pause the game
  await page.evaluate(() => {
    (window as unknown as { __game: { togglePause: () => void } }).__game.togglePause();
  });

  // Wait for render loop to draw the PAUSED overlay
  await page.waitForTimeout(300);

  // Check for PAUSED text in the center of the screen (white, bold 32px)
  // Text is drawn at (320, 240) — check a region around the center
  const hasPausedText = await hasBrightText(page, 250, 215, 390, 255);
  expect(hasPausedText).toBe(true);

  // Verify game is paused
  const isPaused = await page.evaluate(() => {
    return (window as unknown as { __game: { isPaused: () => boolean } }).__game.isPaused();
  });
  expect(isPaused).toBe(true);
});

test('tower can be placed while paused', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Pause during WAVE_PREP (before starting any wave)
  await page.evaluate(() => {
    (window as unknown as { __game: { togglePause: () => void } }).__game.togglePause();
  });

  // Verify paused
  const isPaused = await page.evaluate(() => {
    return (window as unknown as { __game: { isPaused: () => boolean } }).__game.isPaused();
  });
  expect(isPaused).toBe(true);

  // Place a tower via the tower UI (same approach as game.spec.ts)
  await page.evaluate(({ x, y }) => {
    (window as unknown as { __towerUI: { handleTileTap: (t: { x: number; y: number }) => void } })
      .__towerUI.handleTileTap({ x, y });
  }, { x: 2, y: 5 });

  // Select cannon (second row)
  await page.evaluate(({ x, y }) => {
    (window as unknown as { __towerUI: { handleTileTap: (t: { x: number; y: number }) => void } })
      .__towerUI.handleTileTap({ x, y });
  }, { x: 3, y: 7 });

  // Verify tower exists in manager
  const towerExists = await page.evaluate(() => {
    const manager = (window as unknown as {
      __towerManager: { getTowerAt: (x: number, y: number) => unknown };
    }).__towerManager;
    return manager.getTowerAt(2, 5) !== null;
  });
  expect(towerExists).toBe(true);
});

test('pause freezes enemy movement, resume restores it', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Stop game loop for deterministic stepping
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  // Start wave 1 and spawn enemies
  await page.evaluate(() => {
    (window as unknown as { __game: { startWave: () => void } }).__game.startWave();
  });

  // Step 120 frames to let enemies spawn
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(120);
  });

  // Record enemy position
  const pos1 = await page.evaluate(() => {
    const runner = (window as unknown as {
      __waveRunner: { getAliveEnemies: () => { x: number; y: number }[] };
    }).__waveRunner;
    const enemies = runner.getAliveEnemies();
    return enemies.length > 0 ? { x: enemies[0].x, y: enemies[0].y } : null;
  });
  expect(pos1).not.toBeNull();

  // Pause
  await page.evaluate(() => {
    (window as unknown as { __game: { togglePause: () => void } }).__game.togglePause();
  });

  // Step 60 frames while paused — enemies should NOT move
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(60);
  });

  const posPaused = await page.evaluate(() => {
    const runner = (window as unknown as {
      __waveRunner: { getAliveEnemies: () => { x: number; y: number }[] };
    }).__waveRunner;
    const enemies = runner.getAliveEnemies();
    return enemies.length > 0 ? { x: enemies[0].x, y: enemies[0].y } : null;
  });

  if (pos1 && posPaused) {
    expect(Math.abs(posPaused.x - pos1.x)).toBeLessThan(0.01);
    expect(Math.abs(posPaused.y - pos1.y)).toBeLessThan(0.01);
  }

  // Resume
  await page.evaluate(() => {
    (window as unknown as { __game: { togglePause: () => void } }).__game.togglePause();
  });

  // Step 60 frames — enemies should move
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.step(60);
  });

  const posResumed = await page.evaluate(() => {
    const runner = (window as unknown as {
      __waveRunner: { getAliveEnemies: () => { x: number; y: number }[] };
    }).__waveRunner;
    const enemies = runner.getAliveEnemies();
    return enemies.length > 0 ? { x: enemies[0].x, y: enemies[0].y } : null;
  });

  if (posPaused && posResumed) {
    const moved =
      Math.abs(posResumed.x - posPaused.x) > 0.01 ||
      Math.abs(posResumed.y - posPaused.y) > 0.01;
    expect(moved).toBe(true);
  }
});

test('speed toggle is disabled while paused', async ({ page }) => {
  await page.goto('/');
  await startGame(page);

  // Pause
  await page.evaluate(() => {
    (window as unknown as { __game: { togglePause: () => void } }).__game.togglePause();
  });

  // Try to toggle speed — should be ignored
  await page.evaluate(() => {
    (window as unknown as { __game: { toggleSpeed: () => void } }).__game.toggleSpeed();
  });

  const speed = await page.evaluate(() => {
    return (window as unknown as { __game: { getSpeedMultiplier: () => number } }).__game.getSpeedMultiplier();
  });
  expect(speed).toBe(1);

  // Resume and try again — should work
  await page.evaluate(() => {
    (window as unknown as { __game: { togglePause: () => void } }).__game.togglePause();
    (window as unknown as { __game: { toggleSpeed: () => void } }).__game.toggleSpeed();
  });

  const speedAfter = await page.evaluate(() => {
    return (window as unknown as { __game: { getSpeedMultiplier: () => number } }).__game.getSpeedMultiplier();
  });
  expect(speedAfter).toBe(2);
});

