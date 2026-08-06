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

function stopGameLoop(page: Page): Promise<void> {
  return page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });
}

test('health bar renders above damaged enemy', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await stopGameLoop(page);

  const result = await page.evaluate(async () => {
    const { Renderer } = await import('/src/renderer/renderer.ts');
    const { Enemy } = await import('/src/enemies/enemy.ts');
    const { drawHealthBar } = await import('/src/game/enemy-visuals.ts');

    const enemyArchetypes = (
      window as unknown as { __enemyArchetypes: Record<string, unknown> }
    ).__enemyArchetypes;
    const difficulty = (
      window as unknown as { __difficulty: unknown }
    ).__difficulty;

    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const renderer = new Renderer(canvas, {
      tileSize: 32,
      mapWidth: 20,
      mapHeight: 15,
    });

    const gruntData = enemyArchetypes['enemy_grunt'];
    if (!gruntData) throw new Error('Grunt data not found');
    const enemy = new Enemy(gruntData, 1, difficulty, 'path_1');
    enemy.x = 5;
    enemy.y = 7;

    // Damage to 70% HP — green health bar
    enemy.takeDamage(enemy.maxHP * 0.3, false);

    renderer.clear();
    drawHealthBar(renderer, enemy, 32);

    const dpr = window.devicePixelRatio || 1;
    // Health bar at y = 7*32 - 6 = 218, x = 5*32 + 16 - 14 = 162
    // Fill starts at x=162, width = 28 * 0.7 = 19.6
    // Check a pixel in the fill area
    const data = canvas
      .getContext('2d')!
      .getImageData(
        Math.floor(167 * dpr),
        Math.floor(220 * dpr),
        1,
        1,
      ).data;

    return { r: data[0], g: data[1], b: data[2], a: data[3] };
  });

  // Green health bar fill: #22c55e = rgb(34, 197, 94)
  expect(result.r).toBe(34);
  expect(result.g).toBe(197);
  expect(result.b).toBe(94);
  expect(result.a).toBe(255);
});

test('health bar does not render when HP is full', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await stopGameLoop(page);

  const result = await page.evaluate(async () => {
    const { Renderer } = await import('/src/renderer/renderer.ts');
    const { Enemy } = await import('/src/enemies/enemy.ts');
    const { drawHealthBar } = await import('/src/game/enemy-visuals.ts');

    const enemyArchetypes = (
      window as unknown as { __enemyArchetypes: Record<string, unknown> }
    ).__enemyArchetypes;
    const difficulty = (
      window as unknown as { __difficulty: unknown }
    ).__difficulty;

    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const renderer = new Renderer(canvas, {
      tileSize: 32,
      mapWidth: 20,
      mapHeight: 15,
    });

    const gruntData = enemyArchetypes['enemy_grunt'];
    if (!gruntData) throw new Error('Grunt data not found');
    const enemy = new Enemy(gruntData, 1, difficulty, 'path_1');
    enemy.x = 5;
    enemy.y = 7;
    // Full HP — no health bar

    renderer.clear();
    drawHealthBar(renderer, enemy, 32);

    const dpr = window.devicePixelRatio || 1;
    // Check pixel where health bar would be
    const data = canvas
      .getContext('2d')!
      .getImageData(
        Math.floor(167 * dpr),
        Math.floor(220 * dpr),
        1,
        1,
      ).data;

    return { r: data[0], g: data[1], b: data[2], a: data[3] };
  });

  // No health bar drawn — pixel should be transparent
  expect(result.a).toBe(0);
});

test('status tint renders blue for slowed enemy', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await stopGameLoop(page);

  const result = await page.evaluate(async () => {
    const { Renderer } = await import('/src/renderer/renderer.ts');
    const { Enemy } = await import('/src/enemies/enemy.ts');
    const { drawStatusTint } = await import('/src/game/enemy-visuals.ts');

    const enemyArchetypes = (
      window as unknown as { __enemyArchetypes: Record<string, unknown> }
    ).__enemyArchetypes;
    const difficulty = (
      window as unknown as { __difficulty: unknown }
    ).__difficulty;

    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const renderer = new Renderer(canvas, {
      tileSize: 32,
      mapWidth: 20,
      mapHeight: 15,
    });

    const gruntData = enemyArchetypes['enemy_grunt'];
    if (!gruntData) throw new Error('Grunt data not found');
    const enemy = new Enemy(gruntData, 1, difficulty, 'path_1');
    enemy.x = 5;
    enemy.y = 7;
    enemy.applySlow(0.5, 2.0);

    renderer.clear();
    drawStatusTint(renderer, enemy, 32);

    const dpr = window.devicePixelRatio || 1;
    // Tint at x = 5*32 + 2 = 162, y = 7*32 + 2 = 226, size = 28
    const data = canvas
      .getContext('2d')!
      .getImageData(
        Math.floor(170 * dpr),
        Math.floor(230 * dpr),
        1,
        1,
      ).data;

    return { r: data[0], g: data[1], b: data[2], a: data[3] };
  });

  // Blue tint: #3b82f6 = rgb(59, 130, 246) at 0.3 alpha
  // Canvas alpha compositing may round slightly — use tolerance
  const blueTol = 5;
  expect(Math.abs(result.r - 59)).toBeLessThanOrEqual(blueTol);
  expect(Math.abs(result.g - 130)).toBeLessThanOrEqual(blueTol);
  expect(Math.abs(result.b - 246)).toBeLessThanOrEqual(blueTol);
  expect(result.a).toBeGreaterThan(60); // ~76 with tolerance
});

test('status tint renders green for poisoned enemy', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await stopGameLoop(page);

  const result = await page.evaluate(async () => {
    const { Renderer } = await import('/src/renderer/renderer.ts');
    const { Enemy } = await import('/src/enemies/enemy.ts');
    const { drawStatusTint } = await import('/src/game/enemy-visuals.ts');

    const enemyArchetypes = (
      window as unknown as { __enemyArchetypes: Record<string, unknown> }
    ).__enemyArchetypes;
    const difficulty = (
      window as unknown as { __difficulty: unknown }
    ).__difficulty;

    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const renderer = new Renderer(canvas, {
      tileSize: 32,
      mapWidth: 20,
      mapHeight: 15,
    });

    const gruntData = enemyArchetypes['enemy_grunt'];
    if (!gruntData) throw new Error('Grunt data not found');
    const enemy = new Enemy(gruntData, 1, difficulty, 'path_1');
    enemy.x = 5;
    enemy.y = 7;
    enemy.activeDoTEffects.push({
      dotDamage: 5,
      remainingTicks: 3,
      tickInterval: 0.5,
      tickTimer: 0,
    });

    renderer.clear();
    drawStatusTint(renderer, enemy, 32);

    const dpr = window.devicePixelRatio || 1;
    const data = canvas
      .getContext('2d')!
      .getImageData(
        Math.floor(170 * dpr),
        Math.floor(230 * dpr),
        1,
        1,
      ).data;

    return { r: data[0], g: data[1], b: data[2], a: data[3] };
  });

  // Green tint: #22c55e = rgb(34, 197, 94) at 0.3 alpha
  // Canvas alpha compositing may round slightly — use tolerance
  const greenTol = 5;
  expect(Math.abs(result.r - 34)).toBeLessThanOrEqual(greenTol);
  expect(Math.abs(result.g - 197)).toBeLessThanOrEqual(greenTol);
  expect(Math.abs(result.b - 94)).toBeLessThanOrEqual(greenTol);
  expect(result.a).toBeGreaterThan(60); // ~76 with tolerance
});

test('death fade-out: enemy renders with decreasing alpha', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await stopGameLoop(page);

  const result = await page.evaluate(async () => {
    const { Renderer } = await import('/src/renderer/renderer.ts');
    const { Enemy } = await import('/src/enemies/enemy.ts');

    const enemyArchetypes = (
      window as unknown as { __enemyArchetypes: Record<string, unknown> }
    ).__enemyArchetypes;
    const difficulty = (
      window as unknown as { __difficulty: unknown }
    ).__difficulty;

    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const renderer = new Renderer(canvas, {
      tileSize: 32,
      mapWidth: 20,
      mapHeight: 15,
    });

    const gruntData = enemyArchetypes['enemy_grunt'];
    if (!gruntData) throw new Error('Grunt data not found');
    const enemy = new Enemy(gruntData, 1, difficulty, 'path_1');
    enemy.x = 5;
    enemy.y = 7;

    // Kill the enemy — triggers fade
    enemy.takeDamage(enemy.maxHP, false);

    const dpr = window.devicePixelRatio || 1;

    // Draw at full fade alpha (1.0)
    // Rect at x=5*32+8=168, y=7*32+8=232, 16x16 — check pixel at (172, 236)
    renderer.clear();
    renderer.save();
    renderer.setAlpha(enemy.fadeAlpha);
    renderer.drawRect(
      enemy.x * 32 + 8,
      enemy.y * 32 + 8,
      16,
      16,
      '#ff0000',
    );
    renderer.restore();

    const fullAlphaData = canvas
      .getContext('2d')!
      .getImageData(
        Math.floor(172 * dpr),
        Math.floor(236 * dpr),
        1,
        1,
      ).data;

    // Advance fade halfway
    enemy.updateFade(0.15);

    renderer.clear();
    renderer.save();
    renderer.setAlpha(enemy.fadeAlpha);
    renderer.drawRect(
      enemy.x * 32 + 8,
      enemy.y * 32 + 8,
      16,
      16,
      '#ff0000',
    );
    renderer.restore();

    const halfAlphaData = canvas
      .getContext('2d')!
      .getImageData(
        Math.floor(172 * dpr),
        Math.floor(236 * dpr),
        1,
        1,
      ).data;

    return {
      fullAlpha: fullAlphaData[3],
      halfAlpha: halfAlphaData[3],
      fadeAlphaAtFull: 1.0,
      fadeAlphaAtHalf: enemy.fadeAlpha,
    };
  });

  // At full fade (alpha=1.0), red rect should be fully opaque
  expect(result.fullAlpha).toBe(255);
  // At half fade (alpha=0.5), alpha should be ~127-128
  expect(Math.abs(result.halfAlpha - 128)).toBeLessThanOrEqual(3);
  expect(result.fadeAlphaAtHalf).toBeCloseTo(0.5, 1);
});

test('boss health bar renders gold and wider', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await stopGameLoop(page);

  const result = await page.evaluate(async () => {
    const { Renderer } = await import('/src/renderer/renderer.ts');
    const { Enemy } = await import('/src/enemies/enemy.ts');
    const { drawHealthBar } = await import('/src/game/enemy-visuals.ts');

    const enemyArchetypes = (
      window as unknown as { __enemyArchetypes: Record<string, unknown> }
    ).__enemyArchetypes;
    const difficulty = (
      window as unknown as { __difficulty: unknown }
    ).__difficulty;

    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const renderer = new Renderer(canvas, {
      tileSize: 32,
      mapWidth: 20,
      mapHeight: 15,
    });

    const bossData = enemyArchetypes['enemy_boss'];
    if (!bossData) throw new Error('Boss data not found');
    const enemy = new Enemy(bossData, 10, difficulty, 'path_1');
    enemy.x = 5;
    enemy.y = 7;

    // Damage to 70% HP
    enemy.takeDamage(enemy.maxHP * 0.3, false);

    renderer.clear();
    drawHealthBar(renderer, enemy, 32);

    const dpr = window.devicePixelRatio || 1;
    // Boss bar: width = 32*1.5*1.5 = 72, x = 5*32+16 - 36 = 140
    // y = 7*32 - 6 = 218
    // Check pixel in the gold fill area
    const goldData = canvas
      .getContext('2d')!
      .getImageData(
        Math.floor(145 * dpr),
        Math.floor(220 * dpr),
        1,
        1,
      ).data;

    // Check that the bar extends wider than a normal bar (28px)
    // Normal bar would end at x = 162 + 28 = 190
    // Boss bar extends to x = 140 + 72 = 212
    // Check a pixel at x=200 that would be beyond a normal bar
    const wideData = canvas
      .getContext('2d')!
      .getImageData(
        Math.floor(200 * dpr),
        Math.floor(220 * dpr),
        1,
        1,
      ).data;

    return {
      goldR: goldData[0],
      goldG: goldData[1],
      goldB: goldData[2],
      goldA: goldData[3],
      wideA: wideData[3],
    };
  });

  // Gold fill: #ffd700 = rgb(255, 215, 0)
  expect(result.goldR).toBe(255);
  expect(result.goldG).toBe(215);
  expect(result.goldB).toBe(0);
  expect(result.goldA).toBe(255);
  // Boss bar extends wider than normal bar (pixel at x=200 should be non-transparent)
  expect(result.wideA).toBeGreaterThan(0);
});

test('boss BOSS label renders above health bar', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await stopGameLoop(page);

  const result = await page.evaluate(async () => {
    const { Renderer } = await import('/src/renderer/renderer.ts');
    const { Enemy } = await import('/src/enemies/enemy.ts');
    const { drawHealthBar } = await import('/src/game/enemy-visuals.ts');

    const enemyArchetypes = (
      window as unknown as { __enemyArchetypes: Record<string, unknown> }
    ).__enemyArchetypes;
    const difficulty = (
      window as unknown as { __difficulty: unknown }
    ).__difficulty;

    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const renderer = new Renderer(canvas, {
      tileSize: 32,
      mapWidth: 20,
      mapHeight: 15,
    });

    const bossData = enemyArchetypes['enemy_boss'];
    if (!bossData) throw new Error('Boss data not found');
    const enemy = new Enemy(bossData, 10, difficulty, 'path_1');
    enemy.x = 5;
    enemy.y = 7;
    enemy.takeDamage(enemy.maxHP * 0.3, false);

    renderer.clear();
    drawHealthBar(renderer, enemy, 32);

    // Check for non-transparent pixels in the BOSS label area
    // Label is drawn at center x = 5*32+16 = 176, y = 218 - 2 = 216
    // Text is drawn with baseline 'bottom', so pixels should be above y=216
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d')!;

    // Scan a region above the health bar for any non-transparent pixels (the BOSS text)
    let foundText = false;
    for (let dy = 208; dy < 216; dy++) {
      for (let dx = 165; dx < 190; dx++) {
        const data = ctx.getImageData(
          Math.floor(dx * dpr),
          Math.floor(dy * dpr),
          1,
          1,
        ).data;
        if (data[3] > 0) {
          foundText = true;
          break;
        }
      }
      if (foundText) break;
    }

    return { foundText };
  });

  expect(result.foundText).toBe(true);
});

test('damage numbers spawn and float via game integration', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await stopGameLoop(page);

  const result = await page.evaluate(async () => {
    const { Enemy } = await import('/src/enemies/enemy.ts');

    const enemyArchetypes = (
      window as unknown as { __enemyArchetypes: Record<string, unknown> }
    ).__enemyArchetypes;
    const difficulty = (
      window as unknown as { __difficulty: unknown }
    ).__difficulty;

    const damageNumberManager = (
      window as unknown as { __damageNumberManager: {
        spawn: (x: number, y: number, damage: number) => void;
        update: (dt: number) => void;
        getActiveCount: () => number;
        clear: () => void;
      } }
    ).__damageNumberManager;

    const combatManager = (
      window as unknown as {
        __combatManager: {
          update: (dt: number, towers: unknown[], enemies: unknown[]) => void;
        };
      }
    ).__combatManager;

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

    const towerArchetypes = (
      window as unknown as {
        __towerArchetypes: {
          id: string;
          logic: { tiers: { cost: number }[] };
        }[];
      }
    ).__towerArchetypes;

    // Place gatling tower
    const gatlingData = towerArchetypes.find((t) => t.id === 'tower_gatling');
    if (!gatlingData) throw new Error('Gatling tower data not found');
    towerManager.placeTower(gatlingData, 3, 5, economyManager.getGold());
    const tier1 = gatlingData.logic.tiers[0];
    if (tier1) economyManager.spendGold(tier1.cost);

    // Create enemy and run combat
    const gruntData = enemyArchetypes['enemy_grunt'];
    if (!gruntData) throw new Error('Grunt data not found');
    const enemy = new Enemy(gruntData, 1, difficulty, 'path_1');
    enemy.x = 3;
    enemy.y = 7;

    damageNumberManager.clear();

    const hpBefore = enemy.hp;
    combatManager.update(0.1, towerManager.getAllTowers(), [enemy]);
    const damageDealt = hpBefore - enemy.hp;

    // Simulate what the game does: spawn damage number
    if (damageDealt > 0) {
      damageNumberManager.spawn(enemy.x, enemy.y, damageDealt);
    }

    const countAfterSpawn = damageNumberManager.getActiveCount();

    // Update damage numbers (advance time)
    damageNumberManager.update(0.4);
    const countAfterPartialUpdate = damageNumberManager.getActiveCount();

    // Update past lifetime (0.8s total)
    damageNumberManager.update(0.4);
    const countAfterExpiry = damageNumberManager.getActiveCount();

    return {
      damageDealt,
      countAfterSpawn,
      countAfterPartialUpdate,
      countAfterExpiry,
    };
  });

  expect(result.damageDealt).toBeGreaterThan(0);
  expect(result.countAfterSpawn).toBe(1);
  expect(result.countAfterPartialUpdate).toBe(1);
  expect(result.countAfterExpiry).toBe(0);
});

