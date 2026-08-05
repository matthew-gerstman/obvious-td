import { test, expect } from '@playwright/test';

interface GameLoopHandle {
  stop: () => void;
}

const TILE_SIZE = 32;

const ENEMY_IDS = [
  'enemy_grunt',
  'enemy_runner',
  'enemy_armored',
  'enemy_flyer',
  'enemy_swarm',
  'enemy_boss',
];

test('enemies appear on canvas after starting a wave', async ({ page }) => {
  await page.goto('/');

  // Wait for the game loop, then stop it so we control rendering
  await page.waitForFunction(
    () =>
      (window as unknown as { __gameLoop?: unknown }).__gameLoop !== undefined,
  );
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  const result = await page.evaluate(
    async (args: { tileSize: number; enemyIds: string[] }): Promise<{
      spawnX: number;
      spawnY: number;
      pixelColor: { r: number; g: number; b: number; a: number };
      aliveCount: number;
      spawnedCount: number;
    }> => {
      const { tileSize, enemyIds } = args;

      const { loadMap } = await import('/src/maps/map-loader.ts');
      const { WaveRunner } = await import('/src/waves/wave-runner.ts');
      const { Renderer } = await import('/src/renderer/renderer.ts');

      // Load map
      const mapResponse = await fetch('/data/maps/map_single_path.json');
      const mapData = await mapResponse.json();
      const map = loadMap(mapData as object);

      // Load wave table
      const waveResponse = await fetch('/data/waves/wave_table.json');
      const waveTable = await waveResponse.json();

      // Load difficulty
      const diffResponse = await fetch('/data/difficulty.json');
      const diffData = await diffResponse.json();
      const difficulty = diffData.modes.medium;

      // Load enemy data
      const enemyData: Record<string, unknown> = {};
      for (const id of enemyIds) {
        const response = await fetch(`/data/archetypes/${id}.json`);
        enemyData[id] = await response.json();
      }

      // Start wave 1
      const runner = new WaveRunner();
      runner.startWave(1, waveTable, enemyData, difficulty, map);

      // Step once with dt=0 to spawn the first enemy (spawnTime=0)
      // without advancing its position, so it stays at the path start
      runner.update(0, map);

      const aliveEnemies = runner.getAliveEnemies();
      const spawnedCount = runner.getSpawnedCount();

      // Render enemies on the canvas
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const renderer = new Renderer(canvas, {
        tileSize,
        mapWidth: map.width,
        mapHeight: map.height,
      });
      renderer.clear();

      // Draw each alive enemy as a red rectangle
      for (const enemy of aliveEnemies) {
        renderer.drawRect(
          enemy.x * tileSize,
          enemy.y * tileSize,
          tileSize,
          tileSize,
          '#ff0000',
        );
      }

      // Read pixel at the center of the first enemy's tile
      const firstEnemy = aliveEnemies[0];
      const dpr = window.devicePixelRatio || 1;
      const px = Math.floor((firstEnemy.x * tileSize + tileSize / 2) * dpr);
      const py = Math.floor((firstEnemy.y * tileSize + tileSize / 2) * dpr);
      const ctx = canvas.getContext('2d')!;
      const data = ctx.getImageData(px, py, 1, 1).data;

      return {
        spawnX: firstEnemy.x,
        spawnY: firstEnemy.y,
        pixelColor: {
          r: data[0] ?? 0,
          g: data[1] ?? 0,
          b: data[2] ?? 0,
          a: data[3] ?? 0,
        },
        aliveCount: aliveEnemies.length,
        spawnedCount,
      };
    },
    { tileSize: TILE_SIZE, enemyIds: ENEMY_IDS },
  );

  // First enemy should be at the path start (0, 7) for map_single_path
  expect(result.spawnX).toBe(0);
  expect(result.spawnY).toBe(7);

  // At least one enemy spawned and alive
  expect(result.aliveCount).toBeGreaterThanOrEqual(1);
  expect(result.spawnedCount).toBeGreaterThanOrEqual(1);

  // Pixel at enemy position should be red (#ff0000)
  expect(result.pixelColor.r).toBe(255);
  expect(result.pixelColor.g).toBe(0);
  expect(result.pixelColor.b).toBe(0);
  expect(result.pixelColor.a).toBe(255);
});

test('boss telegraph state is set before boss waves', async ({ page }) => {
  await page.goto('/');

  // Wait for the game loop, then stop it
  await page.waitForFunction(
    () =>
      (window as unknown as { __gameLoop?: unknown }).__gameLoop !== undefined,
  );
  await page.evaluate(() => {
    (window as unknown as { __gameLoop: GameLoopHandle }).__gameLoop.stop();
  });

  const result = await page.evaluate(
    async (enemyIds: string[]): Promise<{
      shouldTelegraphBeforeBoss: boolean;
      shouldTelegraphBeforeNormal: boolean;
      messageContainsWave: boolean;
      markShownPreventsRepeat: boolean;
      waveRunnerBossFlag: boolean;
      waveRunnerNormalFlag: boolean;
    }> => {
      const { BossTelegraph } = await import('/src/waves/boss-telegraph.ts');
      const { WaveRunner } = await import('/src/waves/wave-runner.ts');
      const { loadMap } = await import('/src/maps/map-loader.ts');

      // --- BossTelegraph state tests ---
      const telegraph = new BossTelegraph();

      // Wave 5 is a boss wave — telegraph should fire
      const shouldTelegraphBeforeBoss = telegraph.shouldTelegraph(4, 5);

      // Wave 4 is not a boss wave — telegraph should not fire
      const shouldTelegraphBeforeNormal = telegraph.shouldTelegraph(3, 4);

      // Message should include the wave number
      const message = telegraph.getTelegraphMessage(5);
      const messageContainsWave = message.includes('5');

      // After marking shown, should not telegraph again
      telegraph.markShown(5);
      const markShownPreventsRepeat = !telegraph.shouldTelegraph(4, 5);

      // --- WaveRunner boss telegraph flag tests ---
      const mapResponse = await fetch('/data/maps/map_single_path.json');
      const mapData = await mapResponse.json();
      const map = loadMap(mapData as object);

      const waveResponse = await fetch('/data/waves/wave_table.json');
      const waveTable = await waveResponse.json();

      const diffResponse = await fetch('/data/difficulty.json');
      const diffData = await diffResponse.json();
      const difficulty = diffData.modes.medium;

      const enemyData: Record<string, unknown> = {};
      for (const id of enemyIds) {
        const response = await fetch(`/data/archetypes/${id}.json`);
        enemyData[id] = await response.json();
      }

      // Boss wave (5) should set the telegraph flag
      const bossRunner = new WaveRunner();
      bossRunner.startWave(5, waveTable, enemyData, difficulty, map);
      const waveRunnerBossFlag = bossRunner.isBossTelegraphActive();

      // Normal wave (1) should not set the telegraph flag
      const normalRunner = new WaveRunner();
      normalRunner.startWave(1, waveTable, enemyData, difficulty, map);
      const waveRunnerNormalFlag = normalRunner.isBossTelegraphActive();

      return {
        shouldTelegraphBeforeBoss,
        shouldTelegraphBeforeNormal,
        messageContainsWave,
        markShownPreventsRepeat,
        waveRunnerBossFlag,
        waveRunnerNormalFlag,
      };
    },
    ENEMY_IDS,
  );

  expect(result.shouldTelegraphBeforeBoss).toBe(true);
  expect(result.shouldTelegraphBeforeNormal).toBe(false);
  expect(result.messageContainsWave).toBe(true);
  expect(result.markShownPreventsRepeat).toBe(true);
  expect(result.waveRunnerBossFlag).toBe(true);
  expect(result.waveRunnerNormalFlag).toBe(false);
});
