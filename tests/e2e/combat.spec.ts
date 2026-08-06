import { test, expect, type Page } from '@playwright/test';

interface GameLoopHandle {
  stop: () => void;
  step: (count?: number) => void;
}

async function waitForCombatSystems(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (window as unknown as { __combatManager?: unknown }).__combatManager !==
        undefined &&
      (window as unknown as { __waveRunner?: unknown }).__waveRunner !==
        undefined &&
      (window as unknown as { __towerManager?: unknown }).__towerManager !==
        undefined &&
      (window as unknown as { __economyManager?: unknown }).__economyManager !==
        undefined &&
      (window as unknown as { __enemyArchetypes?: unknown })
        .__enemyArchetypes !== undefined &&
      (window as unknown as { __towerArchetypes?: unknown })
        .__towerArchetypes !== undefined &&
      (window as unknown as { __difficulty?: unknown }).__difficulty !==
        undefined,
  );
}

test('tower fires at enemy and deals damage', async ({ page }) => {
  await page.goto('/');
  await waitForCombatSystems(page);

  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  const result = await page.evaluate(async (): Promise<{
    placed: boolean;
    initialHP: number;
    finalHP: number;
  }> => {
    const { Enemy } = await import('/src/enemies/enemy.ts');

    const towerManager = (
      window as unknown as {
        __towerManager: {
          placeTower: (
            archetype: unknown,
            tileX: number,
            tileY: number,
            gold: number,
          ) => { success: boolean };
          getAllTowers: () => unknown[];
        };
      }
    ).__towerManager;

    const economyManager = (
      window as unknown as {
        __economyManager: {
          getGold: () => number;
          spendGold: (amount: number) => boolean;
        };
      }
    ).__economyManager;

    const combatManager = (
      window as unknown as {
        __combatManager: {
          update: (
            dt: number,
            towers: unknown[],
            enemies: unknown[],
          ) => void;
        };
      }
    ).__combatManager;

    const enemyArchetypes = (
      window as unknown as { __enemyArchetypes: Record<string, unknown> }
    ).__enemyArchetypes;

    const difficulty = (
      window as unknown as { __difficulty: unknown }
    ).__difficulty;

    const towerArchetypes = (
      window as unknown as {
        __towerArchetypes: {
          id: string;
          logic: { tiers: { cost: number }[] };
        }[];
      }
    ).__towerArchetypes;

    // Place gatling tower at (3, 5) — near the path at y=7
    const gatlingData = towerArchetypes.find((t) => t.id === 'tower_gatling');
    if (!gatlingData) throw new Error('Gatling tower data not found');
    const placeResult = towerManager.placeTower(
      gatlingData,
      3,
      5,
      economyManager.getGold(),
    );
    if (placeResult.success) {
      const tier1 = gatlingData.logic.tiers[0];
      if (tier1) economyManager.spendGold(tier1.cost);
    }

    // Create grunt enemy at (3, 7) — within gatling range (2.5)
    const gruntData = enemyArchetypes['enemy_grunt'];
    if (!gruntData) throw new Error('Grunt enemy data not found');
    const enemy = new Enemy(gruntData, 1, difficulty, 'path_1');
    enemy.x = 3;
    enemy.y = 7;

    const initialHP = enemy.hp as number;

    // Run one combat tick
    combatManager.update(0.1, towerManager.getAllTowers(), [enemy]);

    return {
      placed: placeResult.success,
      initialHP,
      finalHP: enemy.hp as number,
    };
  });

  expect(result.placed).toBe(true);
  expect(result.finalHP).toBeLessThan(result.initialHP);
});

test('cannon tower kills multiple swarm enemies in one shot (splash)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForCombatSystems(page);

  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  const result = await page.evaluate(async (): Promise<{
    placed: boolean;
    enemyStatuses: string[];
    allDead: boolean;
  }> => {
    const { Enemy } = await import('/src/enemies/enemy.ts');

    const towerManager = (
      window as unknown as {
        __towerManager: {
          placeTower: (
            archetype: unknown,
            tileX: number,
            tileY: number,
            gold: number,
          ) => { success: boolean };
          getAllTowers: () => unknown[];
        };
      }
    ).__towerManager;

    const economyManager = (
      window as unknown as {
        __economyManager: {
          getGold: () => number;
          spendGold: (amount: number) => boolean;
        };
      }
    ).__economyManager;

    const combatManager = (
      window as unknown as {
        __combatManager: {
          update: (
            dt: number,
            towers: unknown[],
            enemies: unknown[],
          ) => void;
        };
      }
    ).__combatManager;

    const enemyArchetypes = (
      window as unknown as { __enemyArchetypes: Record<string, unknown> }
    ).__enemyArchetypes;

    const difficulty = (
      window as unknown as { __difficulty: unknown }
    ).__difficulty;

    const towerArchetypes = (
      window as unknown as {
        __towerArchetypes: {
          id: string;
          logic: { tiers: { cost: number }[] };
        }[];
      }
    ).__towerArchetypes;

    // Place cannon tower at (3, 5)
    const cannonData = towerArchetypes.find((t) => t.id === 'tower_cannon');
    if (!cannonData) throw new Error('Cannon tower data not found');
    const placeResult = towerManager.placeTower(
      cannonData,
      3,
      5,
      economyManager.getGold(),
    );
    if (placeResult.success) {
      const tier1 = cannonData.logic.tiers[0];
      if (tier1) economyManager.spendGold(tier1.cost);
    }

    // Create 3 swarm enemies clustered at (3,7), (4,7), (3,8)
    // All within cannon splash radius (1.5) of the primary target
    const swarmData = enemyArchetypes['enemy_swarm'];
    if (!swarmData) throw new Error('Swarm enemy data not found');

    const enemies: unknown[] = [];
    const positions: [number, number][] = [
      [3, 7],
      [4, 7],
      [3, 8],
    ];
    for (const [x, y] of positions) {
      const enemy = new Enemy(swarmData, 1, difficulty, 'path_1');
      enemy.x = x;
      enemy.y = y;
      enemies.push(enemy);
    }

    // Run one combat tick — cannon fires, splash hits all 3
    combatManager.update(0.1, towerManager.getAllTowers(), enemies);

    return {
      placed: placeResult.success,
      enemyStatuses: enemies.map(
        (e) => (e as { status: string }).status,
      ),
      allDead: enemies.every(
        (e) => (e as { status: string }).status === 'dead',
      ),
    };
  });

  expect(result.placed).toBe(true);
  expect(result.allDead).toBe(true);
});

test('game loop integration — sniper kills wave enemies', async ({ page }) => {
  await page.goto('/');
  await waitForCombatSystems(page);

  // Start the game so the game loop update processes wave runner + combat
  await page.waitForFunction(
    () => (window as unknown as { __game?: { isDataLoaded: () => boolean } })
      .__game?.isDataLoaded() === true,
  );
  await page.evaluate(() => {
    (window as unknown as { __startGame: (d: string, m: string) => boolean })
      .__startGame('easy', 'map_single_path');
  });
  await page.waitForFunction(
    () => (window as unknown as { __game?: { getState: () => string } })
      .__game?.getState() === 'WAVE_PREP',
  );

  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  const result = await page.evaluate(async (): Promise<{
    placed: boolean;
    spawnedCount: number;
    aliveCount: number;
    goldGained: number;
  }> => {
    const towerManager = (
      window as unknown as {
        __towerManager: {
          placeTower: (
            archetype: unknown,
            tileX: number,
            tileY: number,
            gold: number,
          ) => { success: boolean };
          getAllTowers: () => unknown[];
        };
      }
    ).__towerManager;

    const economyManager = (
      window as unknown as {
        __economyManager: {
          getGold: () => number;
          spendGold: (amount: number) => boolean;
        };
      }
    ).__economyManager;

    const waveRunner = (
      window as unknown as {
        __waveRunner: {
          startWave: (
            wave: number,
            waveTable: unknown,
            enemyData: Record<string, unknown>,
            difficulty: unknown,
            map: unknown,
          ) => void;
          getSpawnedCount: () => number;
          getAliveEnemies: () => unknown[];
        };
      }
    ).__waveRunner;

    const towerArchetypes = (
      window as unknown as {
        __towerArchetypes: {
          id: string;
          logic: { tiers: { cost: number }[] };
        }[];
      }
    ).__towerArchetypes;
    const gameLoop = (
      window as unknown as { __gameLoop: GameLoopHandle }
    ).__gameLoop;

    // Place sniper tower at (3, 5) — range 5.0, damage 80
    const sniperData = towerArchetypes.find((t) => t.id === 'tower_sniper');
    if (!sniperData) throw new Error('Sniper tower data not found');
    const placeResult = towerManager.placeTower(
      sniperData,
      3,
      5,
      economyManager.getGold(),
    );
    if (placeResult.success) {
      const tier1 = sniperData.logic.tiers[0];
      if (tier1) economyManager.spendGold(tier1.cost);
    }

    const goldBefore = economyManager.getGold();

    // Start wave 1 via the game's startWave (transitions to WAVE_ACTIVE)
    const game = (window as unknown as { __game: { startWave: () => void } }).__game;
    game.startWave();

    // Step game loop 10 times — first grunt spawns and dies
    gameLoop.step(10);

    const spawnedCount = waveRunner.getSpawnedCount();
    const aliveCount = waveRunner.getAliveEnemies().length;
    const goldAfter = economyManager.getGold();

    return {
      placed: placeResult.success,
      spawnedCount,
      aliveCount,
      goldGained: goldAfter - goldBefore,
    };
  });

  expect(result.placed).toBe(true);
  expect(result.spawnedCount).toBeGreaterThanOrEqual(1);
  expect(result.aliveCount).toBeLessThan(result.spawnedCount);
  expect(result.goldGained).toBeGreaterThan(0);
});

