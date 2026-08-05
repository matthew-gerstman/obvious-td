import { describe, it, expect, afterEach, vi } from 'vitest';
import { screenToCanvas, canvasToTile, screenToTile } from '../../src/input/coordinates';

/**
 * Minimal canvas mock with just the properties screenToCanvas accesses:
 * width/height (backing store) and getBoundingClientRect().
 */
function createMockCanvas(opts: {
  width: number;
  height: number;
  rect: { left: number; top: number; width: number; height: number };
}): HTMLCanvasElement {
  return {
    width: opts.width,
    height: opts.height,
    getBoundingClientRect: () => ({
      left: opts.rect.left,
      top: opts.rect.top,
      width: opts.rect.width,
      height: opts.rect.height,
      right: opts.rect.left + opts.rect.width,
      bottom: opts.rect.top + opts.rect.height,
      x: opts.rect.left,
      y: opts.rect.top,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLCanvasElement;
}

describe('screenToCanvas', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converts screen coordinates accounting for bounding rect and DPR', () => {
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    const canvas = createMockCanvas({
      width: 1600, // logical 800 * dpr 2
      height: 1200, // logical 600 * dpr 2
      rect: { left: 100, top: 50, width: 800, height: 600 },
    });

    // cssX = 200 - 100 = 100, cssY = 100 - 50 = 50
    // scaleX = 1600 / 800 = 2, scaleY = 1200 / 600 = 2
    // logicalX = (100 * 2) / 2 = 100, logicalY = (50 * 2) / 2 = 50
    const result = screenToCanvas(200, 100, canvas);
    expect(result.x).toBe(100);
    expect(result.y).toBe(50);
  });

  it('returns identity when DPR=1 and no viewport scaling', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const canvas = createMockCanvas({
      width: 800,
      height: 600,
      rect: { left: 0, top: 0, width: 800, height: 600 },
    });

    const result = screenToCanvas(100, 50, canvas);
    expect(result.x).toBe(100);
    expect(result.y).toBe(50);
  });

  it('handles viewport scaling when CSS size differs from logical size', () => {
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    const canvas = createMockCanvas({
      width: 1600, // logical 800 * dpr 2
      height: 1200, // logical 600 * dpr 2
      rect: { left: 0, top: 0, width: 400, height: 300 }, // CSS half of logical
    });

    // cssX = 200, cssY = 100
    // scaleX = 1600 / 400 = 4
    // logicalX = (200 * 4) / 2 = 400, logicalY = (100 * 4) / 2 = 200
    const result = screenToCanvas(200, 100, canvas);
    expect(result.x).toBe(400);
    expect(result.y).toBe(200);
  });

  it('handles DPR=1 with viewport downscaling', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const canvas = createMockCanvas({
      width: 800,
      height: 600,
      rect: { left: 50, top: 25, width: 400, height: 300 },
    });

    // cssX = 250 - 50 = 200, cssY = 175 - 25 = 150
    // scaleX = 800 / 400 = 2, scaleY = 600 / 300 = 2
    // logicalX = (200 * 2) / 1 = 400, logicalY = (150 * 2) / 1 = 300
    const result = screenToCanvas(250, 175, canvas);
    expect(result.x).toBe(400);
    expect(result.y).toBe(300);
  });
});

describe('canvasToTile', () => {
  it('converts canvas pixels to tile indices with tileSize 32', () => {
    expect(canvasToTile(0, 0, 32)).toEqual({ x: 0, y: 0 });
    expect(canvasToTile(31, 31, 32)).toEqual({ x: 0, y: 0 });
    expect(canvasToTile(32, 32, 32)).toEqual({ x: 1, y: 1 });
    expect(canvasToTile(63, 63, 32)).toEqual({ x: 1, y: 1 });
    expect(canvasToTile(64, 64, 32)).toEqual({ x: 2, y: 2 });
    expect(canvasToTile(96, 96, 32)).toEqual({ x: 3, y: 3 });
  });

  it('floors toward negative infinity for negative coordinates', () => {
    expect(canvasToTile(-1, -1, 32)).toEqual({ x: -1, y: -1 });
    expect(canvasToTile(-32, -32, 32)).toEqual({ x: -1, y: -1 });
    expect(canvasToTile(-33, -33, 32)).toEqual({ x: -2, y: -2 });
  });

  it('works with different tile sizes', () => {
    expect(canvasToTile(0, 0, 64)).toEqual({ x: 0, y: 0 });
    expect(canvasToTile(63, 63, 64)).toEqual({ x: 0, y: 0 });
    expect(canvasToTile(64, 64, 64)).toEqual({ x: 1, y: 1 });
    expect(canvasToTile(128, 128, 64)).toEqual({ x: 2, y: 2 });
  });
});

describe('screenToTile', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('combines screenToCanvas and canvasToTile end-to-end', () => {
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    const canvas = createMockCanvas({
      width: 1600,
      height: 1200,
      rect: { left: 100, top: 50, width: 800, height: 600 },
    });

    // screenToCanvas(200, 100) -> logical (100, 50)
    // canvasToTile(100, 50, 32) -> {x: 3, y: 1}
    const result = screenToTile(200, 100, canvas, 32);
    expect(result).toEqual({ x: 3, y: 1 });
  });

  it('maps origin screen position to tile (0, 0)', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const canvas = createMockCanvas({
      width: 800,
      height: 600,
      rect: { left: 0, top: 0, width: 800, height: 600 },
    });

    const result = screenToTile(10, 10, canvas, 32);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('maps a centered click to the correct tile', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const canvas = createMockCanvas({
      width: 800,
      height: 600,
      rect: { left: 0, top: 0, width: 800, height: 600 },
    });

    // Tile (5, 4) center = (5*32 + 16, 4*32 + 16) = (176, 144)
    const result = screenToTile(176, 144, canvas, 32);
    expect(result).toEqual({ x: 5, y: 4 });
  });
});
