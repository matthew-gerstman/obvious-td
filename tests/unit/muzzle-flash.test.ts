import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest';
import { MuzzleFlashManager } from '../../src/combat/muzzle-flash';
import { Renderer } from '../../src/renderer/renderer';

// Reuse the mock canvas pattern from renderer.test.ts
function createMockCanvas() {
  const state = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };
  const stateStack: typeof state[] = [];

  const ctx = {
    canvas: null as unknown as HTMLCanvasElement,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    save: vi.fn(() => stateStack.push({ ...state })),
    restore: vi.fn(() => {
      const prev = stateStack.pop();
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
  return { canvas, ctx };
}

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

describe('MuzzleFlashManager', () => {
  test('spawnFlash creates a flash with correct properties', () => {
    const mgr = new MuzzleFlashManager();
    mgr.spawnFlash(3, 5, 3, 7, 'gatling');
    const flashes = mgr.getActiveFlashes();
    expect(flashes).toHaveLength(1);
    expect(flashes[0]!.tileX).toBe(3);
    expect(flashes[0]!.tileY).toBe(5);
    expect(flashes[0]!.targetX).toBe(3);
    expect(flashes[0]!.targetY).toBe(7);
    expect(flashes[0]!.age).toBe(0);
    expect(flashes[0]!.color).toBe('#ffeb3b');
  });

  test('update advances age and removes expired flashes', () => {
    const mgr = new MuzzleFlashManager();
    mgr.spawnFlash(1, 1, 2, 2, 'cannon');
    expect(mgr.getActiveFlashes()).toHaveLength(1);

    // Advance past lifetime (0.08s)
    mgr.update(0.09);
    expect(mgr.getActiveFlashes()).toHaveLength(0);
  });

  test('update keeps flashes that have not expired', () => {
    const mgr = new MuzzleFlashManager();
    mgr.spawnFlash(1, 1, 2, 2, 'gatling');
    mgr.update(0.04);
    expect(mgr.getActiveFlashes()).toHaveLength(1);
    expect(mgr.getActiveFlashes()[0]!.age).toBeCloseTo(0.04);
  });

  test('clear removes all flashes', () => {
    const mgr = new MuzzleFlashManager();
    mgr.spawnFlash(1, 1, 2, 2, 'gatling');
    mgr.spawnFlash(3, 3, 4, 4, 'frost');
    expect(mgr.getActiveFlashes()).toHaveLength(2);
    mgr.clear();
    expect(mgr.getActiveFlashes()).toHaveLength(0);
  });

  test('render calls drawCircle with fading alpha', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    const mgr = new MuzzleFlashManager();
    mgr.spawnFlash(3, 5, 3, 7, 'gatling');

    // Render at age=0 (alpha should be 1.0)
    mgr.render(renderer, 32);
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();

    renderer.destroy();
  });

  test('render does not draw when no flashes are active', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    const mgr = new MuzzleFlashManager();

    mgr.render(renderer, 32);
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();

    renderer.destroy();
  });

  test('unknown tower type defaults to white flash', () => {
    const mgr = new MuzzleFlashManager();
    mgr.spawnFlash(0, 0, 1, 1, 'unknown_type');
    expect(mgr.getActiveFlashes()[0]!.color).toBe('#ffffff');
  });
});

