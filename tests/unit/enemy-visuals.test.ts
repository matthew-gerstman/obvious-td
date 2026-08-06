import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getHealthBarColor, drawHealthBar, drawStatusTint } from '../../src/game/enemy-visuals';
import { Renderer } from '../../src/renderer/renderer';
import { Enemy } from '../../src/enemies/enemy';
import { readFileSync } from 'node:fs';
import type { DifficultyMode, EnemyData } from '../../src/logic/types';

const originalDPR = (globalThis as unknown as { devicePixelRatio?: number }).devicePixelRatio;

beforeAll(() => {
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { devicePixelRatio: number }).devicePixelRatio = 1;
  (globalThis as unknown as { addEventListener: unknown }).addEventListener = vi.fn();
  (globalThis as unknown as { removeEventListener: unknown }).removeEventListener = vi.fn();
  (globalThis as unknown as { innerWidth: number }).innerWidth = 800;
  (globalThis as unknown as { innerHeight: number }).innerHeight = 600;
});

afterAll(() => {
  (globalThis as unknown as { devicePixelRatio?: number }).devicePixelRatio = originalDPR;
});

const diff: DifficultyMode = {
  hpMultiplier: 1,
  hpScalingRate: 1.15,
  startingGold: 1000,
  startingLives: 20,
};

function loadEnemyData(id: string): EnemyData {
  return JSON.parse(readFileSync(`public/data/archetypes/${id}.json`, 'utf-8')) as EnemyData;
}

function makeEnemy(archetypeId: string, x = 0, y = 0): Enemy {
  const data = loadEnemyData(archetypeId);
  const enemy = new Enemy(data, 1, diff, 'path_1');
  enemy.x = x;
  enemy.y = y;
  return enemy;
}

function createMockCtx() {
  const state = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };
  const stack: typeof state[] = [];

  return {
    canvas: null as unknown as HTMLCanvasElement,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    save: vi.fn(() => stack.push({ ...state })),
    restore: vi.fn(() => {
      const prev = stack.pop();
      if (prev) Object.assign(state, prev);
    }),
    scale: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    imageSmoothingEnabled: true,
    filter: 'none',
    get fillStyle() { return state.fillStyle; },
    set fillStyle(v: string) { state.fillStyle = v; },
    get strokeStyle() { return state.strokeStyle; },
    set strokeStyle(v: string) { state.strokeStyle = v; },
    get lineWidth() { return state.lineWidth; },
    set lineWidth(v: number) { state.lineWidth = v; },
    get globalAlpha() { return state.globalAlpha; },
    set globalAlpha(v: number) { state.globalAlpha = v; },
    get font() { return state.font; },
    set font(v: string) { state.font = v; },
    get textAlign() { return state.textAlign; },
    set textAlign(v: string) { state.textAlign = v; },
    get textBaseline() { return state.textBaseline; },
    set textBaseline(v: string) { state.textBaseline = v; },
  } as unknown as CanvasRenderingContext2D;
}

function createRenderer(): Renderer {
  const mockCtx = createMockCtx();
  const canvas = {
    getContext: () => mockCtx,
    style: { touchAction: '' },
  } as unknown as HTMLCanvasElement;
  return new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
}

describe('Enemy Visuals', () => {
  describe('getHealthBarColor', () => {
    it('returns green when HP > 60%', () => {
      expect(getHealthBarColor(0.8, false)).toBe('#22c55e');
    });

    it('returns green at exactly 61%', () => {
      expect(getHealthBarColor(0.61, false)).toBe('#22c55e');
    });

    it('returns yellow when HP is 30-60%', () => {
      expect(getHealthBarColor(0.5, false)).toBe('#eab308');
    });

    it('returns yellow at exactly 60%', () => {
      expect(getHealthBarColor(0.6, false)).toBe('#eab308');
    });

    it('returns red when HP < 30%', () => {
      expect(getHealthBarColor(0.2, false)).toBe('#ef4444');
    });

    it('returns red at exactly 30%', () => {
      expect(getHealthBarColor(0.3, false)).toBe('#ef4444');
    });

    it('returns gold for boss regardless of HP ratio', () => {
      expect(getHealthBarColor(0.9, true)).toBe('#ffd700');
      expect(getHealthBarColor(0.5, true)).toBe('#ffd700');
      expect(getHealthBarColor(0.1, true)).toBe('#ffd700');
    });
  });

  describe('drawHealthBar', () => {
    it('does not draw when HP is full', () => {
      const renderer = createRenderer();
      const enemy = makeEnemy('enemy_grunt', 5, 7);
      const drawRectSpy = vi.spyOn(renderer, 'drawRect');
      const drawStrokeSpy = vi.spyOn(renderer, 'drawStrokeRect');

      drawHealthBar(renderer, enemy, 32);

      expect(drawRectSpy).not.toHaveBeenCalled();
      expect(drawStrokeSpy).not.toHaveBeenCalled();
    });

    it('draws background, fill, and border when damaged', () => {
      const renderer = createRenderer();
      const enemy = makeEnemy('enemy_grunt', 5, 7);
      enemy.takeDamage(enemy.maxHP * 0.3, false); // 70% HP remaining

      const drawRectSpy = vi.spyOn(renderer, 'drawRect');
      const drawStrokeSpy = vi.spyOn(renderer, 'drawStrokeRect');

      drawHealthBar(renderer, enemy, 32);

      // Background + fill = 2 drawRect calls, 1 drawStrokeRect for border
      expect(drawRectSpy).toHaveBeenCalledTimes(2);
      expect(drawStrokeSpy).toHaveBeenCalledTimes(1);
    });

    it('uses green fill when HP > 60%', () => {
      const renderer = createRenderer();
      const enemy = makeEnemy('enemy_grunt', 5, 7);
      enemy.takeDamage(enemy.maxHP * 0.1, false); // 90% HP

      const drawRectSpy = vi.spyOn(renderer, 'drawRect');
      drawHealthBar(renderer, enemy, 32);

      // Second drawRect call is the fill — check its color
      const fillCall = drawRectSpy.mock.calls[1];
      expect(fillCall?.[4]).toBe('#22c55e');
    });

    it('uses yellow fill when HP is 30-60%', () => {
      const renderer = createRenderer();
      const enemy = makeEnemy('enemy_grunt', 5, 7);
      enemy.takeDamage(enemy.maxHP * 0.5, false); // 50% HP

      const drawRectSpy = vi.spyOn(renderer, 'drawRect');
      drawHealthBar(renderer, enemy, 32);

      const fillCall = drawRectSpy.mock.calls[1];
      expect(fillCall?.[4]).toBe('#eab308');
    });

    it('uses red fill when HP < 30%', () => {
      const renderer = createRenderer();
      const enemy = makeEnemy('enemy_grunt', 5, 7);
      enemy.takeDamage(enemy.maxHP * 0.8, false); // 20% HP

      const drawRectSpy = vi.spyOn(renderer, 'drawRect');
      drawHealthBar(renderer, enemy, 32);

      const fillCall = drawRectSpy.mock.calls[1];
      expect(fillCall?.[4]).toBe('#ef4444');
    });

    it('uses gold fill for boss enemies', () => {
      const renderer = createRenderer();
      const enemy = makeEnemy('enemy_boss', 5, 7);
      enemy.takeDamage(enemy.maxHP * 0.3, false); // 70% HP

      const drawRectSpy = vi.spyOn(renderer, 'drawRect');
      drawHealthBar(renderer, enemy, 32);

      const fillCall = drawRectSpy.mock.calls[1];
      expect(fillCall?.[4]).toBe('#ffd700');
    });

    it('draws BOSS label for boss enemies', () => {
      const renderer = createRenderer();
      const enemy = makeEnemy('enemy_boss', 5, 7);
      enemy.takeDamage(enemy.maxHP * 0.3, false);

      const drawTextSpy = vi.spyOn(renderer, 'drawText');
      drawHealthBar(renderer, enemy, 32);

      expect(drawTextSpy).toHaveBeenCalledWith(
        'BOSS',
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ color: '#ffd700' }),
      );
    });

    it('does not draw BOSS label for normal enemies', () => {
      const renderer = createRenderer();
      const enemy = makeEnemy('enemy_grunt', 5, 7);
      enemy.takeDamage(enemy.maxHP * 0.3, false);

      const drawTextSpy = vi.spyOn(renderer, 'drawText');
      drawHealthBar(renderer, enemy, 32);

      expect(drawTextSpy).not.toHaveBeenCalled();
    });
  });

  describe('drawStatusTint', () => {
    it('does not draw when no status effects', () => {
      const renderer = createRenderer();
      const enemy = makeEnemy('enemy_grunt', 5, 7);

      const drawRectSpy = vi.spyOn(renderer, 'drawRect');
      drawStatusTint(renderer, enemy, 32);

      expect(drawRectSpy).not.toHaveBeenCalled();
    });

    it('draws blue tint when enemy is slowed', () => {
      const renderer = createRenderer();
      const enemy = makeEnemy('enemy_grunt', 5, 7);
      enemy.applySlow(0.5, 2.0);

      const drawRectSpy = vi.spyOn(renderer, 'drawRect');
      drawStatusTint(renderer, enemy, 32);

      expect(drawRectSpy).toHaveBeenCalledTimes(1);
      expect(drawRectSpy.mock.calls[0]?.[4]).toBe('#3b82f6');
    });

    it('draws green tint when enemy is poisoned (DoT)', () => {
      const renderer = createRenderer();
      const enemy = makeEnemy('enemy_grunt', 5, 7);
      enemy.activeDoTEffects.push({
        dotDamage: 5,
        remainingTicks: 3,
        tickInterval: 0.5,
        tickTimer: 0,
      });

      const drawRectSpy = vi.spyOn(renderer, 'drawRect');
      drawStatusTint(renderer, enemy, 32);

      expect(drawRectSpy).toHaveBeenCalledTimes(1);
      expect(drawRectSpy.mock.calls[0]?.[4]).toBe('#22c55e');
    });

    it('draws both tints when slowed and poisoned', () => {
      const renderer = createRenderer();
      const enemy = makeEnemy('enemy_grunt', 5, 7);
      enemy.applySlow(0.5, 2.0);
      enemy.activeDoTEffects.push({
        dotDamage: 5,
        remainingTicks: 3,
        tickInterval: 0.5,
        tickTimer: 0,
      });

      const drawRectSpy = vi.spyOn(renderer, 'drawRect');
      drawStatusTint(renderer, enemy, 32);

      expect(drawRectSpy).toHaveBeenCalledTimes(2);
    });
  });
});

describe('Enemy Death Fade', () => {
  it('takeDamage initializes fade properties on death', () => {
    const enemy = makeEnemy('enemy_grunt', 5, 7);
    enemy.takeDamage(enemy.maxHP, false);

    expect(enemy.status).toBe('dead');
    expect(enemy.fadeAlpha).toBe(1.0);
    expect(enemy.fadeTimer).toBe(0.3);
  });

  it('fade properties are zero-initialized on construction', () => {
    const enemy = makeEnemy('enemy_grunt', 5, 7);
    expect(enemy.fadeAlpha).toBe(0);
    expect(enemy.fadeTimer).toBe(0);
    expect(enemy.fadeDuration).toBe(0.3);
  });

  it('updateFade decrements timer and alpha', () => {
    const enemy = makeEnemy('enemy_grunt', 5, 7);
    enemy.takeDamage(enemy.maxHP, false);

    const complete = enemy.updateFade(0.1);

    expect(complete).toBe(false);
    expect(enemy.fadeTimer).toBeCloseTo(0.2, 5);
    expect(enemy.fadeAlpha).toBeCloseTo(0.6667, 3);
  });

  it('updateFade returns true when fade completes', () => {
    const enemy = makeEnemy('enemy_grunt', 5, 7);
    enemy.takeDamage(enemy.maxHP, false);

    enemy.updateFade(0.3);

    expect(enemy.fadeTimer).toBeLessThanOrEqual(0);
    expect(enemy.fadeAlpha).toBe(0);
  });

  it('updateFade with dt=0 is a no-op', () => {
    const enemy = makeEnemy('enemy_grunt', 5, 7);
    enemy.takeDamage(enemy.maxHP, false);

    const complete = enemy.updateFade(0);

    expect(complete).toBe(false);
    expect(enemy.fadeAlpha).toBe(1.0);
    expect(enemy.fadeTimer).toBe(0.3);
  });

  it('updateFade returns true immediately if no fade active', () => {
    const enemy = makeEnemy('enemy_grunt', 5, 7);

    const complete = enemy.updateFade(0.1);

    expect(complete).toBe(true);
  });

  it('partial fade updates then completion', () => {
    const enemy = makeEnemy('enemy_grunt', 5, 7);
    enemy.takeDamage(enemy.maxHP, false);

    // 0.1s — 2/3 alpha remaining
    enemy.updateFade(0.1);
    expect(enemy.fadeAlpha).toBeCloseTo(0.6667, 3);

    // 0.1s more — 1/3 alpha remaining
    enemy.updateFade(0.1);
    expect(enemy.fadeAlpha).toBeCloseTo(0.3333, 3);

    // 0.1s more — fade complete
    enemy.updateFade(0.1);
    expect(enemy.fadeAlpha).toBe(0);
  });
});

