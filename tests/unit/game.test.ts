import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { GameStateMachine } from '../../src/game/game-state';
import type { DifficultyKey } from '../../src/game/game-state';

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
  // window must exist for Game's hook exposure
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { devicePixelRatio: number }).devicePixelRatio = 1;
  (globalThis as unknown as { addEventListener: unknown }).addEventListener = vi.fn();
  (globalThis as unknown as { removeEventListener: unknown }).removeEventListener = vi.fn();

  global.requestAnimationFrame = vi.fn(() => 0) as typeof global.requestAnimationFrame;
  global.cancelAnimationFrame = vi.fn() as typeof global.cancelAnimationFrame;

  // Mock fetch to read from the filesystem
  global.fetch = vi.fn((url: string) => {
    const filePath = url.replace(/^\//, '');
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

// ── Pure state machine tests ─────────────────────────────────────

describe('GameStateMachine', () => {
  test('starts in TITLE state', () => {
    const sm = new GameStateMachine();
    expect(sm.getState()).toBe('TITLE');
  });

  test('TITLE -> WAVE_PREP is valid', () => {
    const sm = new GameStateMachine();
    expect(sm.transitionTo('WAVE_PREP', 'start')).toBe(true);
    expect(sm.getState()).toBe('WAVE_PREP');
  });

  test('WAVE_PREP -> WAVE_ACTIVE is valid', () => {
    const sm = new GameStateMachine();
    sm.transitionTo('WAVE_PREP');
    expect(sm.transitionTo('WAVE_ACTIVE', 'start wave')).toBe(true);
    expect(sm.getState()).toBe('WAVE_ACTIVE');
  });

  test('WAVE_ACTIVE -> WAVE_PREP is valid', () => {
    const sm = new GameStateMachine();
    sm.transitionTo('WAVE_PREP');
    sm.transitionTo('WAVE_ACTIVE');
    expect(sm.transitionTo('WAVE_PREP', 'wave complete')).toBe(true);
    expect(sm.getState()).toBe('WAVE_PREP');
  });

  test('WAVE_ACTIVE -> DEFEAT is valid', () => {
    const sm = new GameStateMachine();
    sm.transitionTo('WAVE_PREP');
    sm.transitionTo('WAVE_ACTIVE');
    expect(sm.transitionTo('DEFEAT', 'all lives lost')).toBe(true);
    expect(sm.getState()).toBe('DEFEAT');
  });

  test('WAVE_ACTIVE -> VICTORY is valid', () => {
    const sm = new GameStateMachine();
    sm.transitionTo('WAVE_PREP');
    sm.transitionTo('WAVE_ACTIVE');
    expect(sm.transitionTo('VICTORY', 'all waves complete')).toBe(true);
    expect(sm.getState()).toBe('VICTORY');
  });

  test('VICTORY -> TITLE is valid', () => {
    const sm = new GameStateMachine();
    sm.transitionTo('WAVE_PREP');
    sm.transitionTo('WAVE_ACTIVE');
    sm.transitionTo('VICTORY');
    expect(sm.transitionTo('TITLE', 'return')).toBe(true);
    expect(sm.getState()).toBe('TITLE');
  });

  test('DEFEAT -> TITLE is valid', () => {
    const sm = new GameStateMachine();
    sm.transitionTo('WAVE_PREP');
    sm.transitionTo('WAVE_ACTIVE');
    sm.transitionTo('DEFEAT');
    expect(sm.transitionTo('TITLE', 'return')).toBe(true);
    expect(sm.getState()).toBe('TITLE');
  });

  test('invalid transitions return false', () => {
    const sm = new GameStateMachine();
    expect(sm.transitionTo('WAVE_ACTIVE')).toBe(false);
    expect(sm.transitionTo('VICTORY')).toBe(false);
    expect(sm.transitionTo('DEFEAT')).toBe(false);
    expect(sm.getState()).toBe('TITLE');
  });

  test('reset returns to TITLE', () => {
    const sm = new GameStateMachine();
    sm.transitionTo('WAVE_PREP');
    sm.transitionTo('WAVE_ACTIVE');
    sm.reset();
    expect(sm.getState()).toBe('TITLE');
  });
});

// ── Game-level integration tests ─────────────────────────────────
// These use a mock canvas + mocked fetch to test the Game class.

describe('Game state transitions', () => {
  let canvas: HTMLCanvasElement;

  beforeAll(() => {
    canvas = createMockCanvas();
  });

  test('TITLE -> WAVE_PREP via start()', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    expect(game.getState()).toBe('TITLE');
    expect(game.start('easy', 'map_single_path')).toBe(true);
    expect(game.getState()).toBe('WAVE_PREP');
    game.destroy();
  });

  test('WAVE_PREP -> WAVE_ACTIVE via startWave()', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');
    game.startWave();
    expect(game.getState()).toBe('WAVE_ACTIVE');
    game.destroy();
  });

  test('WAVE_ACTIVE -> WAVE_PREP when wave completes', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');
    game.startWave();

    // Mock wave runner to report complete
    const w = globalThis as unknown as { __waveRunner: { isWaveComplete: () => boolean; update: () => void; getAliveEnemies: () => unknown[] } };
    w.__waveRunner.isWaveComplete = () => true;
    w.__waveRunner.update = () => {};
    w.__waveRunner.getAliveEnemies = () => [];

    const gl = globalThis as unknown as { __gameLoop: { step: (n?: number) => void; stop: () => void } };
    gl.__gameLoop.stop();
    gl.__gameLoop.step(1);

    expect(game.getState()).toBe('WAVE_PREP');
    game.destroy();
  });

  test('WAVE_ACTIVE -> DEFEAT when lives reach 0', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');
    game.startWave();

    // Mock economy to report 0 lives
    const eco = globalThis as unknown as { __economyManager: { getLives: () => number } };
    eco.__economyManager.getLives = () => 0;

    // Mock wave runner to avoid spawning/leaking
    const w = globalThis as unknown as { __waveRunner: { isWaveComplete: () => boolean; update: () => void; getAliveEnemies: () => unknown[] } };
    w.__waveRunner.isWaveComplete = () => false;
    w.__waveRunner.update = () => {};
    w.__waveRunner.getAliveEnemies = () => [];

    const gl = globalThis as unknown as { __gameLoop: { step: (n?: number) => void; stop: () => void } };
    gl.__gameLoop.stop();
    gl.__gameLoop.step(1);

    expect(game.getState()).toBe('DEFEAT');
    game.destroy();
  });

  test('WAVE_ACTIVE -> VICTORY when wave 30 completes', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');

    const gl = globalThis as unknown as { __gameLoop: { step: (n?: number) => void; stop: () => void } };
    gl.__gameLoop.stop();

    // Complete 30 waves
    for (let i = 0; i < 30; i++) {
      game.startWave();
      const w = globalThis as unknown as { __waveRunner: { isWaveComplete: () => boolean; update: () => void; getAliveEnemies: () => unknown[] } };
      w.__waveRunner.isWaveComplete = () => true;
      w.__waveRunner.update = () => {};
      w.__waveRunner.getAliveEnemies = () => [];
      gl.__gameLoop.step(1);
    }

    expect(game.getState()).toBe('VICTORY');
    game.destroy();
  });
});

describe('Difficulty initialization', () => {
  let canvas: HTMLCanvasElement;

  beforeAll(() => {
    canvas = createMockCanvas();
  });

  async function startWithDifficulty(diff: DifficultyKey): Promise<{ gold: number; lives: number }> {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start(diff, 'map_single_path');

    const eco = globalThis as unknown as { __economyManager: { getGold: () => number; getLives: () => number } };
    const result = { gold: eco.__economyManager.getGold(), lives: eco.__economyManager.getLives() };
    game.destroy();
    return result;
  }

  test('Easy: starting gold=200, lives=20', async () => {
    const { gold, lives } = await startWithDifficulty('easy');
    expect(gold).toBe(200);
    expect(lives).toBe(20);
  });

  test('Medium: starting gold=150, lives=15', async () => {
    const { gold, lives } = await startWithDifficulty('medium');
    expect(gold).toBe(150);
    expect(lives).toBe(15);
  });

  test('Hard: starting gold=100, lives=10', async () => {
    const { gold, lives } = await startWithDifficulty('hard');
    expect(gold).toBe(100);
    expect(lives).toBe(10);
  });
});

describe('Speed control', () => {
  let canvas: HTMLCanvasElement;

  beforeAll(() => {
    canvas = createMockCanvas();
  });

  test('1x speed: 1 update tick per step', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');
    expect(game.getSpeedMultiplier()).toBe(1);

    const gl = globalThis as unknown as { __gameLoop: { step: (n?: number) => void; stop: () => void; getTickCount: () => number } };
    gl.__gameLoop.stop();
    const before = gl.__gameLoop.getTickCount();
    gl.__gameLoop.step(1);
    const after = gl.__gameLoop.getTickCount();

    expect(after - before).toBe(1);
    game.destroy();
  });

  test('2x speed: 2 update ticks per step', async () => {
    const { Game } = await import('../../src/game/game');
    const game = new Game(canvas);
    await vi.waitFor(() => expect(game.isDataLoaded()).toBe(true), { timeout: 5000 });

    game.start('easy', 'map_single_path');
    game.toggleSpeed();
    expect(game.getSpeedMultiplier()).toBe(2);

    const gl = globalThis as unknown as { __gameLoop: { step: (n?: number) => void; stop: () => void; getTickCount: () => number } };
    gl.__gameLoop.stop();
    const before = gl.__gameLoop.getTickCount();
    gl.__gameLoop.step(1);
    const after = gl.__gameLoop.getTickCount();

    expect(after - before).toBe(2);
    game.destroy();
  });
});

