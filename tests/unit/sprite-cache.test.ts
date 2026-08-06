import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { SpriteCache } from '../../src/renderer/sprite-loader';

// ── Mock Image for node environment ──────────────────────────────

const OriginalImage = (globalThis as unknown as { Image?: unknown }).Image;

beforeAll(() => {
  const MockImageImpl = class {
    width = 32;
    height = 32;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src = '';
    get src() { return this._src; }
    set src(value: string) {
      this._src = value;
      // Simulate async image load
      setTimeout(() => {
        if (this.onload) this.onload();
      }, 0);
    }
  };
  (globalThis as unknown as { Image: unknown }).Image = MockImageImpl;
});

afterAll(() => {
  if (OriginalImage) {
    (globalThis as unknown as { Image: unknown }).Image = OriginalImage;
  } else {
    delete (globalThis as unknown as { Image?: unknown }).Image;
  }
});

// ── SpriteCache tests ────────────────────────────────────────────

describe('SpriteCache', () => {
  test('load stores sprite, get returns it, has returns true', async () => {
    const cache = new SpriteCache();
    expect(cache.has('/sprites/tower.png')).toBe(false);
    expect(cache.get('/sprites/tower.png')).toBeNull();

    await cache.load('/sprites/tower.png');

    expect(cache.has('/sprites/tower.png')).toBe(true);
    const sprite = cache.get('/sprites/tower.png');
    expect(sprite).not.toBeNull();
  });

  test('get returns null for unloaded path', () => {
    const cache = new SpriteCache();
    expect(cache.get('/sprites/missing.png')).toBeNull();
  });

  test('has returns false for unloaded path', () => {
    const cache = new SpriteCache();
    expect(cache.has('/sprites/missing.png')).toBe(false);
  });

  test('load is idempotent — loading same path twice does not error', async () => {
    const cache = new SpriteCache();
    await cache.load('/sprites/tower.png');
    await cache.load('/sprites/tower.png');
    expect(cache.has('/sprites/tower.png')).toBe(true);
  });

  test('preload loads multiple sprites in parallel', async () => {
    const cache = new SpriteCache();
    const paths = ['/sprites/a.png', '/sprites/b.png', '/sprites/c.png'];
    await cache.preload(paths);
    for (const p of paths) {
      expect(cache.has(p)).toBe(true);
      expect(cache.get(p)).not.toBeNull();
    }
  });

  test('preload with empty array completes without error', async () => {
    const cache = new SpriteCache();
    await cache.preload([]);
    // No assertions needed — just verifying it doesn't throw
  });
});

