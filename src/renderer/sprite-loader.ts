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
