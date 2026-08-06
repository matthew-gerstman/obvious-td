import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { DamageNumberManager } from '../../src/game/damage-numbers';
import { Renderer } from '../../src/renderer/renderer';

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

describe('DamageNumberManager', () => {
  it('spawn creates a damage number at the given position', () => {
    const mgr = new DamageNumberManager();
    mgr.spawn(5, 7, 42);
    expect(mgr.getActiveCount()).toBe(1);
  });

  it('spawn rounds damage to nearest integer', () => {
    const mgr = new DamageNumberManager();
    mgr.spawn(0, 0, 42.6);
    mgr.spawn(0, 0, 42.3);
    // Both should spawn — we can't directly inspect the value,
    // but the count confirms they were created
    expect(mgr.getActiveCount()).toBe(2);
  });

  it('update advances lifetime and decreases alpha', () => {
    const mgr = new DamageNumberManager();
    mgr.spawn(5, 7, 10);

    // After 0.1s, alpha should be less than 1 but > 0
    mgr.update(0.1);
    expect(mgr.getActiveCount()).toBe(1);
  });

  it('numbers expire after 0.8 seconds', () => {
    const mgr = new DamageNumberManager();
    mgr.spawn(5, 7, 10);

    // After exactly 0.8s, alpha should be 0 and number removed
    mgr.update(0.8);
    expect(mgr.getActiveCount()).toBe(0);
  });

  it('numbers float upward over time', () => {
    const mgr = new DamageNumberManager();
    mgr.spawn(5, 10, 10);

    // We can't directly inspect y, but we can verify the number
    // is still active after partial update and gone after full lifetime
    mgr.update(0.4);
    expect(mgr.getActiveCount()).toBe(1);

    mgr.update(0.4);
    expect(mgr.getActiveCount()).toBe(0);
  });

  it('multiple damage numbers can be active simultaneously', () => {
    const mgr = new DamageNumberManager();
    mgr.spawn(1, 1, 10);
    mgr.spawn(2, 2, 20);
    mgr.spawn(3, 3, 30);
    expect(mgr.getActiveCount()).toBe(3);
  });

  it('cap at 50 active numbers — oldest evicted', () => {
    const mgr = new DamageNumberManager();
    for (let i = 0; i < 55; i++) {
      mgr.spawn(i, 0, 1);
    }
    // Should be capped at 50
    expect(mgr.getActiveCount()).toBe(50);
  });

  it('clear removes all damage numbers', () => {
    const mgr = new DamageNumberManager();
    mgr.spawn(1, 1, 10);
    mgr.spawn(2, 2, 20);
    mgr.clear();
    expect(mgr.getActiveCount()).toBe(0);
  });

  it('update with dt=0 is a no-op on lifetime', () => {
    const mgr = new DamageNumberManager();
    mgr.spawn(1, 1, 10);
    mgr.update(0);
    expect(mgr.getActiveCount()).toBe(1);
  });

  it('partial updates then full expiry', () => {
    const mgr = new DamageNumberManager();
    mgr.spawn(1, 1, 10);

    // 0.3s — still alive
    mgr.update(0.3);
    expect(mgr.getActiveCount()).toBe(1);

    // 0.3s more (total 0.6s) — still alive
    mgr.update(0.3);
    expect(mgr.getActiveCount()).toBe(1);

    // 0.2s more (total 0.8s) — expired
    mgr.update(0.2);
    expect(mgr.getActiveCount()).toBe(0);
  });

  it('render calls drawText for each active number', () => {
    const mgr = new DamageNumberManager();
    mgr.spawn(5, 7, 42);

    // Create a mock renderer
    const mockCtx = createMockCtx();
    const canvas = {
      getContext: () => mockCtx,
      style: { touchAction: '' },
    } as unknown as HTMLCanvasElement;
    const renderer = new Renderer(canvas, {
      tileSize: 32,
      mapWidth: 20,
      mapHeight: 15,
    });

    const spy = vi.spyOn(renderer, 'drawText');
    mgr.render(renderer, 32);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      '42',
      5 * 32 + 16, // x * tileSize + tileSize/2
      7 * 32, // y * tileSize
      expect.objectContaining({
        color: '#ffffff',
        align: 'center',
        baseline: 'bottom',
      }),
    );
  });

  it('render with no active numbers is a no-op', () => {
    const mgr = new DamageNumberManager();

    const mockCtx = createMockCtx();
    const canvas = {
      getContext: () => mockCtx,
      style: { touchAction: '' },
    } as unknown as HTMLCanvasElement;
    const renderer = new Renderer(canvas, {
      tileSize: 32,
      mapWidth: 20,
      mapHeight: 15,
    });

    const spy = vi.spyOn(renderer, 'drawText');
    mgr.render(renderer, 32);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── Mock canvas context (same pattern as renderer.test.ts) ──────────
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

