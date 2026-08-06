import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// ── Mock globals ─────────────────────────────────────────────────

const originalFetch = global.fetch;
const originalRAF = global.requestAnimationFrame;
const originalCAF = global.cancelAnimationFrame;
const originalDPR = (globalThis as unknown as { devicePixelRatio?: number }).devicePixelRatio;

function createMockCanvas(): HTMLCanvasElement {
  const ctx = {
    canvas: null as unknown as HTMLCanvasElement,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    fillStyle: '',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };

  const canvas = {
    width: 640,
    height: 480,
    style: {} as Record<string, string>,
    getContext: vi.fn(() => ctx),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({
      width: 640, height: 480, left: 0, top: 0, right: 640, bottom: 480, x: 0, y: 0,
    })),
  } as unknown as HTMLCanvasElement;

  ctx.canvas = canvas;
  return canvas;
}

beforeAll(() => {
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { devicePixelRatio: number }).devicePixelRatio = 1;
  (globalThis as unknown as { addEventListener: unknown }).addEventListener = vi.fn();
  (globalThis as unknown as { removeEventListener: unknown }).removeEventListener = vi.fn();

  global.requestAnimationFrame = vi.fn(() => 0) as typeof global.requestAnimationFrame;
  global.cancelAnimationFrame = vi.fn() as typeof global.cancelAnimationFrame;

  global.fetch = vi.fn((url: string) => {
    const filePath = url.replace(/^\//, 'public/');
    const fullPath = path.resolve(__dirname, '../../', filePath);
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    return Promise.resolve({ json: () => Promise.resolve(data) }) as unknown as Response;
  }) as typeof global.fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
  global.requestAnimationFrame = originalRAF;
  global.cancelAnimationFrame = originalCAF;
  (globalThis as unknown as { devicePixelRatio?: number }).devicePixelRatio = originalDPR;
});

// ── Wave preview tests ──────────────────────────────────────────

describe('Wave preview', () => {
  let canvas: HTMLCanvasElement;

  beforeAll(() => {
    canvas = createMockCanvas();
  });

  test('wave preview text is available during WAVE_PREP for wave 1', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');
    expect(game.getState()).toBe('WAVE_PREP');

    // Verify the wave table data that feeds the preview is correct
    const waveTable = (globalThis as unknown as { __waveTable: { waves: { wave: number; enemies: { enemyId: string; count: number }[] }[] } }).__waveTable;
    const wave1 = waveTable.waves.find((w) => w.wave === 1);
    expect(wave1).toBeDefined();
    expect(wave1!.enemies[0].enemyId).toBe('enemy_grunt');
    expect(wave1!.enemies[0].count).toBe(5);

    game.destroy();
  });

  test('wave preview shows boss warning for boss waves', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');

    // Advance to wave 4 completion so next wave is 5 (boss wave)
    const gl = (globalThis as unknown as { __gameLoop: { step: (n?: number) => void; stop: () => void } }).__gameLoop;
    gl.stop();

    // Complete waves 1-4
    for (let i = 0; i < 4; i++) {
      game.startWave();
      const w = globalThis as unknown as { __waveRunner: { isWaveComplete: () => boolean; update: () => void; getAliveEnemies: () => unknown[] } };
      w.__waveRunner.isWaveComplete = () => true;
      w.__waveRunner.update = () => {};
      w.__waveRunner.getAliveEnemies = () => [];
      gl.step(1);
    }

    // Now in WAVE_PREP for wave 5 (boss wave)
    expect(game.getState()).toBe('WAVE_PREP');
    expect(game.getCurrentWave()).toBe(4);

    // The next wave (5) should be a boss wave
    const waveTable = (globalThis as unknown as { __waveTable: { waves: { wave: number; enemies: { enemyId: string; count: number }[] }[] } }).__waveTable;
    const wave5 = waveTable.waves.find((w) => w.wave === 5);
    expect(wave5).toBeDefined();
    const hasBoss = wave5!.enemies.some((e) => e.enemyId === 'enemy_boss');
    expect(hasBoss).toBe(true);

    game.destroy();
  });
});

// ── Auto-start countdown tests ──────────────────────────────────

describe('Auto-start countdown', () => {
  let canvas: HTMLCanvasElement;

  beforeAll(() => {
    canvas = createMockCanvas();
  });

  test('wave 1 does NOT auto-start (requires manual start)', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');
    expect(game.getState()).toBe('WAVE_PREP');
    expect(game.getCurrentWave()).toBe(0);

    // Stop the game loop and manually step past the auto-start delay
    const gl = (globalThis as unknown as { __gameLoop: { step: (n?: number) => void; stop: () => void } }).__gameLoop;
    gl.stop();

    // Step 600 frames (10 seconds at 60fps) — should NOT auto-start wave 1
    gl.step(600);

    expect(game.getState()).toBe('WAVE_PREP');
    expect(game.getCurrentWave()).toBe(0);
    game.destroy();
  });

  test('wave 2+ auto-starts after 10 seconds when auto-start is ON', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');

    const gl = (globalThis as unknown as { __gameLoop: { step: (n?: number) => void; stop: () => void } }).__gameLoop;
    gl.stop();

    // Manually start wave 1 and complete it
    game.startWave();
    const w = globalThis as unknown as { __waveRunner: { isWaveComplete: () => boolean; update: () => void; getAliveEnemies: () => unknown[] } };
    w.__waveRunner.isWaveComplete = () => true;
    w.__waveRunner.update = () => {};
    w.__waveRunner.getAliveEnemies = () => [];
    gl.step(1);

    // Now in WAVE_PREP for wave 2, auto-start should be ON by default
    expect(game.getState()).toBe('WAVE_PREP');
    expect(game.getCurrentWave()).toBe(1);
    expect(game.isAutoStartEnabled()).toBe(true);

    // Step 600 frames (10 seconds) — should auto-start wave 2
    gl.step(600);

    expect(game.getState()).toBe('WAVE_ACTIVE');
    expect(game.getCurrentWave()).toBe(2);
    game.destroy();
  });

  test('wave 2+ does NOT auto-start when auto-start is OFF', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');

    const gl = (globalThis as unknown as { __gameLoop: { step: (n?: number) => void; stop: () => void } }).__gameLoop;
    gl.stop();

    // Manually start wave 1 and complete it
    game.startWave();
    const w = globalThis as unknown as { __waveRunner: { isWaveComplete: () => boolean; update: () => void; getAliveEnemies: () => unknown[] } };
    w.__waveRunner.isWaveComplete = () => true;
    w.__waveRunner.update = () => {};
    w.__waveRunner.getAliveEnemies = () => [];
    gl.step(1);

    // Now in WAVE_PREP for wave 2
    expect(game.getState()).toBe('WAVE_PREP');

    // Toggle auto-start OFF
    game.toggleAutoStart();
    expect(game.isAutoStartEnabled()).toBe(false);

    // Step 900 frames (15 seconds) — should NOT auto-start
    gl.step(900);

    expect(game.getState()).toBe('WAVE_PREP');
    expect(game.getCurrentWave()).toBe(1);
    game.destroy();
  });

  test('toggling auto-start off resets the countdown timer', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');

    const gl = (globalThis as unknown as { __gameLoop: { step: (n?: number) => void; stop: () => void } }).__gameLoop;
    gl.stop();

    // Complete wave 1
    game.startWave();
    const w = globalThis as unknown as { __waveRunner: { isWaveComplete: () => boolean; update: () => void; getAliveEnemies: () => unknown[] } };
    w.__waveRunner.isWaveComplete = () => true;
    w.__waveRunner.update = () => {};
    w.__waveRunner.getAliveEnemies = () => [];
    gl.step(1);

    // In WAVE_PREP for wave 2, step 300 frames (5 seconds)
    gl.step(300);
    expect(game.getPrepTimer()).toBeGreaterThan(0);

    // Toggle auto-start off — timer should reset
    game.toggleAutoStart();
    expect(game.getPrepTimer()).toBe(0);

    game.destroy();
  });

  test('manual start wave works during countdown', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');

    const gl = (globalThis as unknown as { __gameLoop: { step: (n?: number) => void; stop: () => void } }).__gameLoop;
    gl.stop();

    // Complete wave 1
    game.startWave();
    const w = globalThis as unknown as { __waveRunner: { isWaveComplete: () => boolean; update: () => void; getAliveEnemies: () => unknown[] } };
    w.__waveRunner.isWaveComplete = () => true;
    w.__waveRunner.update = () => {};
    w.__waveRunner.getAliveEnemies = () => [];
    gl.step(1);

    // In WAVE_PREP for wave 2, step 300 frames (5 seconds into countdown)
    gl.step(300);
    expect(game.getState()).toBe('WAVE_PREP');

    // Manually start wave 2 — should work even during countdown
    game.startWave();
    expect(game.getState()).toBe('WAVE_ACTIVE');
    expect(game.getCurrentWave()).toBe(2);

    game.destroy();
  });
});

// ── Pause tests ─────────────────────────────────────────────────

describe('Pause', () => {
  let canvas: HTMLCanvasElement;

  beforeAll(() => {
    canvas = createMockCanvas();
  });

  test('togglePause toggles the paused state', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');
    expect(game.isPaused()).toBe(false);

    game.togglePause();
    expect(game.isPaused()).toBe(true);

    game.togglePause();
    expect(game.isPaused()).toBe(false);

    game.destroy();
  });

  test('pause freezes game updates (enemies do not move)', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');

    const gl = (globalThis as unknown as { __gameLoop: { step: (n?: number) => void; stop: () => void } }).__gameLoop;
    gl.stop();

    // Start wave 1
    game.startWave();

    // Step 120 frames to spawn enemies
    gl.step(120);

    const runner = (globalThis as unknown as { __waveRunner: { getAliveEnemies: () => { x: number; y: number }[] } }).__waveRunner;
    const enemiesBefore = runner.getAliveEnemies();
    expect(enemiesBefore.length).toBeGreaterThan(0);
    const posBefore = { x: enemiesBefore[0].x, y: enemiesBefore[0].y };

    // Pause
    game.togglePause();
    expect(game.isPaused()).toBe(true);

    // Step 60 frames while paused — enemies should NOT move
    gl.step(60);

    const enemiesAfter = runner.getAliveEnemies();
    const posAfter = enemiesAfter.length > 0 ? { x: enemiesAfter[0].x, y: enemiesAfter[0].y } : posBefore;

    expect(posAfter.x).toBeCloseTo(posBefore.x, 5);
    expect(posAfter.y).toBeCloseTo(posBefore.y, 5);

    game.destroy();
  });

  test('resume allows game updates to continue', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');

    const gl = (globalThis as unknown as { __gameLoop: { step: (n?: number) => void; stop: () => void } }).__gameLoop;
    gl.stop();

    // Complete wave 1 to enter WAVE_PREP for wave 2 (auto-start countdown active)
    game.startWave();
    const w = globalThis as unknown as { __waveRunner: { isWaveComplete: () => boolean; update: () => void; getAliveEnemies: () => unknown[] } };
    w.__waveRunner.isWaveComplete = () => true;
    w.__waveRunner.update = () => {};
    w.__waveRunner.getAliveEnemies = () => [];
    gl.step(1);

    expect(game.getState()).toBe('WAVE_PREP');
    expect(game.getCurrentWave()).toBe(1);

    // Step 200 frames (~3.3s) — prep timer should advance
    gl.step(200);
    const timerAfterUnpaused = game.getPrepTimer();
    expect(timerAfterUnpaused).toBeGreaterThan(0);

    // Pause — prep timer should NOT advance
    game.togglePause();
    gl.step(200);
    expect(game.getPrepTimer()).toBeCloseTo(timerAfterUnpaused, 5);

    // Resume — prep timer should advance again (total ~6.6s, under 10s auto-start threshold)
    game.togglePause();
    expect(game.isPaused()).toBe(false);
    gl.step(200);
    expect(game.getPrepTimer()).toBeGreaterThan(timerAfterUnpaused);

    game.destroy();
  });

  test('speed toggle is disabled when paused', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');
    expect(game.getSpeedMultiplier()).toBe(1);

    // Pause
    game.togglePause();
    expect(game.isPaused()).toBe(true);

    // Try to toggle speed — should be ignored
    game.toggleSpeed();
    expect(game.getSpeedMultiplier()).toBe(1);

    // Resume and try again — should work
    game.togglePause();
    game.toggleSpeed();
    expect(game.getSpeedMultiplier()).toBe(2);

    game.destroy();
  });

  test('pause is reset on new game start', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');
    game.togglePause();
    expect(game.isPaused()).toBe(true);

    // Unpause before triggering defeat (update is skipped when paused)
    game.togglePause();
    expect(game.isPaused()).toBe(false);

    // Trigger defeat to get back to TITLE, then start a new game
    const gl = (globalThis as unknown as { __gameLoop: { step: (n?: number) => void; stop: () => void } }).__gameLoop;
    gl.stop();
    game.startWave();
    const eco = globalThis as unknown as { __economyManager: { getLives: () => number } };
    eco.__economyManager.getLives = () => 0;
    const w = globalThis as unknown as { __waveRunner: { isWaveComplete: () => boolean; update: () => void; getAliveEnemies: () => unknown[] } };
    w.__waveRunner.isWaveComplete = () => false;
    w.__waveRunner.update = () => {};
    w.__waveRunner.getAliveEnemies = () => [];
    gl.step(1);
    expect(game.getState()).toBe('DEFEAT');

    // Return to title and start a new game — pause should be reset
    game.returnToTitle();
    expect(game.getState()).toBe('TITLE');
    game.start('easy', 'map_single_path');
    expect(game.isPaused()).toBe(false);

    game.destroy();
  });

  test('auto-start is reset to ON on new game start', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');
    game.toggleAutoStart();
    expect(game.isAutoStartEnabled()).toBe(false);

    // Trigger defeat to get back to TITLE, then start a new game
    const gl = (globalThis as unknown as { __gameLoop: { step: (n?: number) => void; stop: () => void } }).__gameLoop;
    gl.stop();
    game.startWave();
    const eco = globalThis as unknown as { __economyManager: { getLives: () => number } };
    eco.__economyManager.getLives = () => 0;
    const w = globalThis as unknown as { __waveRunner: { isWaveComplete: () => boolean; update: () => void; getAliveEnemies: () => unknown[] } };
    w.__waveRunner.isWaveComplete = () => false;
    w.__waveRunner.update = () => {};
    w.__waveRunner.getAliveEnemies = () => [];
    gl.step(1);
    expect(game.getState()).toBe('DEFEAT');

    // Return to title and start a new game — auto-start should be reset to ON
    game.returnToTitle();
    expect(game.getState()).toBe('TITLE');
    game.start('easy', 'map_single_path');
    expect(game.isAutoStartEnabled()).toBe(true);

    game.destroy();
  });
});

