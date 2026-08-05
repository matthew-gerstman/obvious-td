/**
 * Coordinate conversion utilities for mapping screen input to tile grid positions.
 *
 * The renderer draws in logical coordinates: the context transform is scaled
 * by devicePixelRatio so that one logical unit equals one CSS pixel at 1x.
 * screenToCanvas therefore returns logical coordinates — the same space the
 * renderer draws in — so that canvasToTile can divide directly by tileSize.
 */

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface TilePoint {
  x: number;
  y: number;
}

/**
 * Convert screen (clientX/Y) coordinates to logical canvas coordinates.
 *
 * Accounts for the canvas bounding-rect offset, the CSS-to-backing-store
 * size ratio, and devicePixelRatio so the result matches the renderer's
 * drawing coordinate space.
 */
export function screenToCanvas(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
): CanvasPoint {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  // CSS pixels relative to the canvas element
  const cssX = clientX - rect.left;
  const cssY = clientY - rect.top;

  // CSS → backing store → logical (backing store divided by dpr)
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;

  return {
    x: (cssX * scaleX) / dpr,
    y: (cssY * scaleY) / dpr,
  };
}

/**
 * Convert logical canvas pixel coordinates to integer tile grid indices.
 * Returns {x, y} where x and y are the column/row in the tile grid.
 */
export function canvasToTile(
  canvasX: number,
  canvasY: number,
  tileSize: number,
): TilePoint {
  return {
    x: Math.floor(canvasX / tileSize),
    y: Math.floor(canvasY / tileSize),
  };
}

/**
 * Convert screen coordinates directly to tile grid indices.
 * Convenience wrapper combining screenToCanvas and canvasToTile.
 */
export function screenToTile(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  tileSize: number,
): TilePoint {
  const { x, y } = screenToCanvas(clientX, clientY, canvas);
  return canvasToTile(x, y, tileSize);
}
