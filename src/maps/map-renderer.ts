import type { Renderer } from '../renderer/renderer';
import type { GameMap } from './map-loader';

export interface MapRenderOptions {
  showBuildable?: boolean;
  showGrid?: boolean;
  tileSize?: number;
}

// Debug/placeholder colors — sprite-based rendering comes later
const PATH_COLOR = '#8b7355'; // brown dirt road
const GRASS_COLOR = '#2d4a2d'; // dark green grass
const BUILDABLE_COLOR = 'rgba(100, 149, 237, 0.25)'; // subtle blue overlay
const GRID_COLOR = 'rgba(255, 255, 255, 0.08)';
const START_COLOR = '#51cf66'; // green marker
const END_COLOR = '#ff6b6b'; // red marker

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

  // Draw path tiles
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.isPathTile(x, y)) {
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

