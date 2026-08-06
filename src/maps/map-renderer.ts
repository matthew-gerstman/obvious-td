import type { Renderer } from '../renderer/renderer';
import type { SpriteCache } from '../renderer/sprite-loader';
import type { GameMap } from './map-loader';

export interface MapRenderOptions {
  showBuildable?: boolean;
  showGrid?: boolean;
  tileSize?: number;
  spriteCache?: SpriteCache;
  pathTileDir?: string;
}

// Fallback colors used when sprites are not available
const PATH_COLOR = '#8b7355'; // brown dirt road
const GRASS_COLOR = '#2d4a2d'; // dark green grass
const BUILDABLE_COLOR = 'rgba(100, 149, 237, 0.25)'; // subtle blue overlay
const GRID_COLOR = 'rgba(255, 255, 255, 0.08)';
const START_COLOR = '#51cf66'; // green marker
const END_COLOR = '#ff6b6b'; // red marker

// Default path tile sprite directory
const DEFAULT_PATH_DIR = 'sprites/default';

/** Determine path tile orientation from neighboring path tiles. */
function getPathTileType(map: GameMap, x: number, y: number): string {
  const hasN = y > 0 && map.isPathTile(x, y - 1);
  const hasS = y < map.height - 1 && map.isPathTile(x, y + 1);
  const hasE = x < map.width - 1 && map.isPathTile(x + 1, y);
  const hasW = x > 0 && map.isPathTile(x - 1, y);

  // Corners: exactly 2 perpendicular neighbors
  if (hasN && hasE && !hasS && !hasW) return 'corner_ne';
  if (hasN && hasW && !hasS && !hasE) return 'corner_nw';
  if (hasS && hasE && !hasN && !hasW) return 'corner_se';
  if (hasS && hasW && !hasN && !hasE) return 'corner_sw';

  // Straight or junction — vertical if N/S present, else horizontal
  if (hasN || hasS) return 'v';
  return 'h';
}

/**
 * Renders a map on the canvas using the WI-3 renderer's drawRect primitive.
 * This is a debug/placeholder renderer — actual sprite-based rendering comes later.
 * Does NOT clear the canvas; caller should clear first if needed.
 */
export function renderMap(
  renderer: Renderer,
  map: GameMap,
  options?: MapRenderOptions,
): void {
  const tileSize = options?.tileSize ?? 32;

  // Draw grass background for all non-path tiles
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!map.isPathTile(x, y)) {
        renderer.drawRect(
          x * tileSize,
          y * tileSize,
          tileSize,
          tileSize,
          GRASS_COLOR,
        );
      }
    }
  }

  // Draw path tiles — sprites with fallback to flat color
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.isPathTile(x, y)) {
        const tileType = getPathTileType(map, x, y);
        const dir = options?.pathTileDir ?? DEFAULT_PATH_DIR;
        const spritePath = `${dir}/path_tile_${tileType}.png`;
        const sprite = options?.spriteCache?.get(spritePath);
        if (sprite) {
          renderer.drawSprite(sprite, x * tileSize, y * tileSize, tileSize, tileSize);
        } else {
          renderer.drawRect(
            x * tileSize,
            y * tileSize,
            tileSize,
            tileSize,
            PATH_COLOR,
          );
        }
      }
    }
  }

  // Draw buildable tile highlights
  if (options?.showBuildable) {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.isBuildable(x, y)) {
          renderer.drawRect(
            x * tileSize,
            y * tileSize,
            tileSize,
            tileSize,
            BUILDABLE_COLOR,
          );
        }
      }
    }
  }

  // Draw grid overlay
  if (options?.showGrid) {
    for (let x = 0; x <= map.width; x++) {
      renderer.drawRect(
        x * tileSize,
        0,
        1,
        map.height * tileSize,
        GRID_COLOR,
      );
    }
    for (let y = 0; y <= map.height; y++) {
      renderer.drawRect(
        0,
        y * tileSize,
        map.width * tileSize,
        1,
        GRID_COLOR,
      );
    }
  }

  // Draw start point markers (inset so path color is visible around them)
  const markerInset = Math.floor(tileSize * 0.25);
  const markerSize = tileSize - markerInset * 2;
  for (const sp of map.startPoints) {
    renderer.drawRect(
      sp.x * tileSize + markerInset,
      sp.y * tileSize + markerInset,
      markerSize,
      markerSize,
      START_COLOR,
    );
  }

  // Draw end point marker (inset)
  renderer.drawRect(
    map.endPoint.x * tileSize + markerInset,
    map.endPoint.y * tileSize + markerInset,
    markerSize,
    markerSize,
    END_COLOR,
  );
}

