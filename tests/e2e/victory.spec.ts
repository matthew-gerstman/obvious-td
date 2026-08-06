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

test('headless victory on Easy with automated tower placement', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await waitForDataLoaded(page);

  // Start game on Easy with Single Path map via test hook
  await page.evaluate(() => {
    (window as unknown as { __startGame: (d: string, m: string) => boolean })
      .__startGame('easy', 'map_single_path');
  });
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getState: () => string } })
        .__game?.getState() === 'WAVE_PREP',
  );

  // Stop game loop and enable 2x speed for deterministic stepping
  await page.evaluate(() => {
    (window as unknown as { __game: { toggleSpeed: () => void } }).__game.toggleSpeed();
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  // Get buildable tiles sorted by adjacency to path
  const buildableTiles = await page.evaluate(() => {
    const map = (window as unknown as {
      __gameMap: {
        buildableTiles: Set<string>;
        isPathTile: (x: number, y: number) => boolean;
      };
    }).__gameMap;
    const tiles: Array<{ x: number; y: number; adjacent: boolean }> = [];
    for (const key of map.buildableTiles) {
      const [x, y] = key.split(',').map(Number);
      const adjacent = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(
        ([nx, ny]) => map.isPathTile(nx, ny),
      );
      tiles.push({ x, y, adjacent });
    }
    // Sort: adjacent to path first
    tiles.sort((a, b) => Number(b.adjacent) - Number(a.adjacent));
    return tiles;
  });

  // Play through 30 waves
  for (let wave = 1; wave <= 30; wave++) {
    // Place towers during WAVE_PREP (no stepping needed)
    await page.evaluate((tiles) => {
      const tm = (window as unknown as {
        __towerManager: {
          placeTower: (a: unknown, x: number, y: number, g: number) => { success: boolean };
          upgradeTower: (id: string, g: number) => { success: boolean };
          getTowerAt: (x: number, y: number) => unknown;
          isBuildable: (x: number, y: number) => boolean;
          getAllTowers: () => Array<{
            id: string;
            canUpgrade: () => boolean;
            getUpgradeCost: () => number;
          }>;
        };
      }).__towerManager;
      const eco = (window as unknown as {
        __economyManager: { getGold: () => number; spendGold: (n: number) => boolean };
      }).__economyManager;
      const archetypes = (window as unknown as {
        __towerArchetypes: Array<{
          id: string;
          logic: { tiers: Array<{ cost: number; tier: number }> };
        }>;
      }).__towerArchetypes;

      const gatling = archetypes.find((t) => t.id === 'tower_gatling');
      const cannon = archetypes.find((t) => t.id === 'tower_cannon');
      const sniper = archetypes.find((t) => t.id === 'tower_sniper');

      if (!gatling || !cannon || !sniper) return;

      // Phase 1: Place new towers on empty buildable tiles
      // Prioritize Gatling (cheapest, best DPS/cost), then Cannon, then Sniper
      for (const tile of tiles) {
        if (tm.getTowerAt(tile.x, tile.y)) continue;
        if (!tm.isBuildable(tile.x, tile.y)) continue;

        const gatlingTier1 = gatling.logic.tiers[0];
        if (gatlingTier1 && eco.getGold() >= gatlingTier1.cost) {
          const result = tm.placeTower(gatling, tile.x, tile.y, eco.getGold());
          if (result.success) {
            eco.spendGold(gatlingTier1.cost);
            continue;
          }
        }

        const cannonTier1 = cannon.logic.tiers[0];
        if (cannonTier1 && eco.getGold() >= cannonTier1.cost) {
          const result = tm.placeTower(cannon, tile.x, tile.y, eco.getGold());
          if (result.success) {
            eco.spendGold(cannonTier1.cost);
            continue;
          }
        }

        const sniperTier1 = sniper.logic.tiers[0];
        if (sniperTier1 && eco.getGold() >= sniperTier1.cost) {
          const result = tm.placeTower(sniper, tile.x, tile.y, eco.getGold());
          if (result.success) {
            eco.spendGold(sniperTier1.cost);
            continue;
          }
        }
      }

      // Phase 2: Upgrade existing towers (after placing new ones)
      for (const tower of tm.getAllTowers()) {
        while (tower.canUpgrade()) {
          const cost = tower.getUpgradeCost();
          if (eco.getGold() >= cost) {
            const result = tm.upgradeTower(tower.id, eco.getGold());
            if (result.success) {
              eco.spendGold(cost);
            } else {
              break;
            }
          } else {
            break;
          }
        }
      }
    }, buildableTiles);

    // Start the wave
    await page.evaluate(() => {
      (window as unknown as { __game: { startWave: () => void } }).__game.startWave();
    });

    // Step through the wave until state changes from WAVE_ACTIVE
    const waveResult = await page.evaluate(() => {
      const gl = (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop;
      const game = (window as unknown as {
        __game: { getState: () => string; getCurrentWave: () => number };
      }).__game;

      for (let batch = 0; batch < 10000; batch++) {
        gl.step(60); // 60 ticks = 1s at 1x, 2s at 2x
        const state = game.getState();
        if (state !== 'WAVE_ACTIVE') {
          return { state, wave: game.getCurrentWave(), batch };
        }
      }
      return { state: 'TIMEOUT', wave: game.getCurrentWave(), batch: 10000 };
    });

    if (waveResult.state === 'DEFEAT') {
      throw new Error(
        `Defeat at wave ${waveResult.wave} — balance may be too hard on Easy`,
      );
    }
    if (waveResult.state === 'TIMEOUT') {
      throw new Error(`Timed out during wave ${waveResult.wave}`);
    }
    if (waveResult.state === 'VICTORY') {
      break;
    }
    // Continue to next wave (state is WAVE_PREP)
  }

  // Verify victory state
  const finalState = await page.evaluate(() =>
    (window as unknown as { __game: { getState: () => string } }).__game.getState(),
  );
  expect(finalState).toBe('VICTORY');

  // Restart game loop to render the victory screen
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.start();
  });
  await page.waitForTimeout(300);

  // Check for victory screen pixels (non-bg in the title text area)
  const hasVictoryContent = await hasNonBgPixel(page, 100, 80, 540, 200);
  expect(hasVictoryContent).toBe(true);
});

