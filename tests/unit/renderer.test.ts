import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { Renderer } from '../../src/renderer/renderer';

// ── Mock canvas with stateful save/restore ───────────────────────

interface MockCtxState {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
}

function createMockCtx() {
  const stateStack: MockCtxState[] = [];
  const state: MockCtxState = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };

  // Capture state at draw-call time (before restore resets it)
  let capturedFillStyle = '';
  let capturedStrokeStyle = '';
  let capturedLineWidth = 1;

  const ctx = {
    canvas: null as unknown as HTMLCanvasElement,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(() => {
      capturedStrokeStyle = state.strokeStyle;
      capturedLineWidth = state.lineWidth;
    }),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    save: vi.fn(() => {
      stateStack.push({ ...state });
    }),
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
    fill: vi.fn(() => {
      capturedFillStyle = state.fillStyle;
    }),
    stroke: vi.fn(() => {
      capturedStrokeStyle = state.strokeStyle;
      capturedLineWidth = state.lineWidth;
    }),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    imageSmoothingEnabled: true,
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
    // Expose internal state for test assertions
    _state: state,
    _captured: {
      get fillStyle() { return capturedFillStyle; },
      get strokeStyle() { return capturedStrokeStyle; },
      get lineWidth() { return capturedLineWidth; },
    },
  };
  return ctx;
}

function createMockCanvas() {
  const ctx = createMockCtx();
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

// ── drawCircle ───────────────────────────────────────────────────

describe('Renderer.drawCircle', () => {
  test('calls arc with center, radius, and full circle angles', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.drawCircle(50, 60, 20, '#ff0000');
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalledWith(50, 60, 20, 0, Math.PI * 2);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx._captured.fillStyle).toBe('#ff0000');
    renderer.destroy();
  });

  test('saves and restores canvas state', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.drawCircle(0, 0, 10, '#00ff00');
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
    renderer.destroy();
  });
});

// ── drawStrokeCircle ──────────────────────────────────────────────

describe('Renderer.drawStrokeCircle', () => {
  test('calls arc with center, radius, and full circle angles', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.drawStrokeCircle(50, 60, 20, '#00ffff', 2);
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalledWith(50, 60, 20, 0, Math.PI * 2);
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx._captured.strokeStyle).toBe('#00ffff');
    expect(ctx._captured.lineWidth).toBe(2);
    renderer.destroy();
  });

  test('defaults lineWidth to 1 when omitted', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.drawStrokeCircle(0, 0, 10, '#fff');
    expect(ctx._captured.lineWidth).toBe(1);
    renderer.destroy();
  });

  test('does not call fill', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.drawStrokeCircle(0, 0, 10, '#fff');
    expect(ctx.fill).not.toHaveBeenCalled();
    renderer.destroy();
  });
});

// ── drawStrokeRect ───────────────────────────────────────────────

describe('Renderer.drawStrokeRect', () => {
  test('calls strokeRect with position and dimensions', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.drawStrokeRect(10, 20, 30, 40, '#0000ff', 2);
    expect(ctx.strokeRect).toHaveBeenCalledWith(10, 20, 30, 40);
    expect(ctx._captured.strokeStyle).toBe('#0000ff');
    expect(ctx._captured.lineWidth).toBe(2);
    renderer.destroy();
  });

  test('defaults lineWidth to 1 when omitted', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.drawStrokeRect(0, 0, 10, 10, '#fff');
    expect(ctx._captured.lineWidth).toBe(1);
    renderer.destroy();
  });

  test('does not call fillRect', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.drawStrokeRect(0, 0, 10, 10, '#fff');
    expect(ctx.fillRect).not.toHaveBeenCalled();
    renderer.destroy();
  });
});

// ── drawLine ─────────────────────────────────────────────────────

describe('Renderer.drawLine', () => {
  test('calls moveTo and lineTo with endpoints', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.drawLine(0, 0, 100, 100, '#ff00ff', 3);
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(100, 100);
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx._captured.strokeStyle).toBe('#ff00ff');
    expect(ctx._captured.lineWidth).toBe(3);
    renderer.destroy();
  });

  test('defaults width to 1 when omitted', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.drawLine(0, 0, 10, 10, '#000');
    expect(ctx._captured.lineWidth).toBe(1);
    renderer.destroy();
  });
});

// ── setAlpha / save / restore round-trip ─────────────────────────

describe('Renderer.setAlpha / save / restore', () => {
  test('setAlpha sets globalAlpha on context', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.setAlpha(0.5);
    expect(ctx._state.globalAlpha).toBe(0.5);
    renderer.destroy();
  });

  test('save/restore round-trip preserves alpha after restore', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.setAlpha(0.5);
    renderer.save();
    renderer.setAlpha(1.0);
    expect(ctx._state.globalAlpha).toBe(1.0);
    renderer.restore();
    expect(ctx._state.globalAlpha).toBe(0.5);
    renderer.destroy();
  });

  test('save and restore delegate to ctx', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.save();
    expect(ctx.save).toHaveBeenCalled();
    renderer.restore();
    expect(ctx.restore).toHaveBeenCalled();
    renderer.destroy();
  });
});

// ── rotate ───────────────────────────────────────────────────────

describe('Renderer.rotate', () => {
  test('calls ctx.rotate with the given angle', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.rotate(Math.PI / 2);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
    renderer.destroy();
  });
});

// ── translate ────────────────────────────────────────────────────

describe('Renderer.translate', () => {
  test('calls ctx.translate with x and y', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    renderer.translate(15, 25);
    expect(ctx.translate).toHaveBeenCalledWith(15, 25);
    renderer.destroy();
  });
});

// ── imageSmoothingEnabled ────────────────────────────────────────

describe('Renderer.resize sets imageSmoothingEnabled', () => {
  test('disables image smoothing for crisp pixel-art scaling', () => {
    const { canvas, ctx } = createMockCanvas();
    const renderer = new Renderer(canvas, { tileSize: 32, mapWidth: 20, mapHeight: 15 });
    // resize() is called in constructor, verify it set the flag
    expect(ctx.imageSmoothingEnabled).toBe(false);
    renderer.destroy();
  });
});

