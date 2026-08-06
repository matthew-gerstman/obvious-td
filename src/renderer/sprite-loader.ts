// Sprite loading and generation utilities for Canvas2D rendering.

export type Sprite = HTMLImageElement | ImageBitmap | HTMLCanvasElement;

/** Load an image from a URL or data URI. Rejects on load error. */
export async function loadSprite(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load sprite: ${src}`));
    img.src = src;
  });
}

/** Create a solid-color rectangle sprite for testing (no external image needed). */
export function createSolidColorSprite(
  width: number,
  height: number,
  color: string,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D context for sprite generation');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

/**
 * On-demand sprite cache. Loads sprites lazily and stores them for reuse.
 * Avoids redundant Image decode work when the same sprite is drawn every frame.
 */
export class SpriteCache {
  private cache = new Map<string, Sprite>();

  /** Load a sprite and store it in the cache. No-op if already cached. */
  async load(path: string): Promise<void> {
    if (this.cache.has(path)) return;
    const sprite = await loadSprite(path);
    this.cache.set(path, sprite);
  }

  /** Get a cached sprite, or null if not loaded. */
  get(path: string): Sprite | null {
    return this.cache.get(path) ?? null;
  }

  /** Check if a sprite is in the cache. */
  has(path: string): boolean {
    return this.cache.has(path);
  }

  /** Preload multiple sprites in parallel. */
  async preload(paths: string[]): Promise<void> {
    await Promise.all(paths.map((p) => this.load(p)));
  }
}

/**
 * Load a sprite sheet image and slice it into individual Sprite objects.
 * Frames are extracted left-to-right, top-to-bottom.
 * Forward-compatible infrastructure for potential future sprite sheets.
 */
export async function loadSpriteSheet(
  imagePath: string,
  frameWidth: number,
  frameHeight: number,
): Promise<Sprite[]> {
  const img = await loadSprite(imagePath);
  const cols = Math.floor(img.width / frameWidth);
  const rows = Math.floor(img.height / frameHeight);
  const sprites: Sprite[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const canvas = document.createElement('canvas');
      canvas.width = frameWidth;
      canvas.height = frameHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get 2D context for sprite sheet slicing');
      ctx.drawImage(
        img,
        col * frameWidth, row * frameHeight, frameWidth, frameHeight,
        0, 0, frameWidth, frameHeight,
      );
      sprites.push(canvas);
    }
  }

  return sprites;
}
