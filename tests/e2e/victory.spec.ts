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
    // Place towers during WAVE_PREP using a mixed strategy:
    //   1. Economy towers on non-adjacent tiles for passive income
    //   2. Frost towers on adjacent tiles for slow (keeps enemies in range)
    //   3. Cannon on adjacent tiles for splash damage against groups
    //   4. Sniper on adjacent tiles for armor-piercing damage
    //   5. Gatling to fill remaining adjacent tiles (best DPS/cost)
    //   6. Upgrade all towers, prioritizing damage towers over utility
    await page.evaluate((tiles) => {
      const tm = (window as unknown as {
        __towerManager: {
          placeTower: (a: unknown, x: number, y: number, g: number) => { success: boolean };
          upgradeTower: (id: string, g: number) => { success: boolean };
          getTowerAt: (x: number, y: number) => unknown;
          isBuildable: (x: number, y: number) => boolean;
          getAllTowers: () => Array<{
            id: string;
            archetype: { id: string };
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
      const frost = archetypes.find((t) => t.id === 'tower_frost');
      const economy = archetypes.find((t) => t.id === 'tower_economy');

      if (!gatling || !cannon || !sniper || !frost || !economy) return;

      const adjacentTiles = tiles.filter((t) => t.adjacent);
      const nonAdjacentTiles = tiles.filter((t) => !t.adjacent);

      const countByType = (archId: string) =>
        tm.getAllTowers().filter((t) => t.archetype.id === archId).length;

      // Try to place one tower of the given archetype on the first available tile
      const tryPlace = (
        archetype: { logic: { tiers: Array<{ cost: number; tier: number }> } },
        tileList: Array<{ x: number; y: number }>,
      ): boolean => {
        const cost = archetype.logic.tiers[0].cost;
        if (eco.getGold() < cost) return false;
        for (const tile of tileList) {
          if (tm.getTowerAt(tile.x, tile.y)) continue;
          if (!tm.isBuildable(tile.x, tile.y)) continue;
          const result = tm.placeTower(archetype, tile.x, tile.y, eco.getGold());
          if (result.success) {
            eco.spendGold(cost);
            return true;
          }
        }
        return false;
      };

      // Phase 1: Economy tower on non-adjacent tile (up to 2 total)
      if (countByType('tower_economy') < 2) {
        const tileList = nonAdjacentTiles.length > 0 ? nonAdjacentTiles : adjacentTiles;
        tryPlace(economy, tileList);
      }

      // Phase 2: Frost tower on adjacent tile (up to 2 total)
      if (countByType('tower_frost') < 2) {
        tryPlace(frost, adjacentTiles);
      }

      // Phase 3: Cannon on adjacent tile (up to 2 total)
      if (countByType('tower_cannon') < 2) {
        tryPlace(cannon, adjacentTiles);
      }

      // Phase 4: Sniper on adjacent tile (up to 2 total)
      if (countByType('tower_sniper') < 2) {
        tryPlace(sniper, adjacentTiles);
      }

      // Phase 5: Fill remaining adjacent tiles with Gatling T1
      while (tryPlace(gatling, adjacentTiles)) {
        // keep placing until gold runs out or tiles are full
      }

      // Phase 6: Upgrade all towers — prioritize damage, then utility, then economy
      const upgradeOrder = [
        'tower_gatling',
        'tower_cannon',
        'tower_sniper',
        'tower_frost',
        'tower_economy',
      ];
      for (const archId of upgradeOrder) {
        for (const tower of tm.getAllTowers()) {
          if (tower.archetype.id !== archId) continue;
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

