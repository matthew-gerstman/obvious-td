import { test, expect } from '@playwright/test';

const MAP_FILES = [
  'map_single_path.json',
  'map_multi_path.json',
  'map_branching.json',
];

const TILE_SIZE = 32;

interface PixelColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface RenderResult {
  canvasWidth: number;
  canvasHeight: number;
  expectedWidth: number;
  expectedHeight: number;
  pathPixel: PixelColor | null;
  nonPathPixel: PixelColor | null;
}

for (const mapFile of MAP_FILES) {
  test.describe(`Map rendering — ${mapFile}`, () => {
    test('path tiles have a different color than non-path tiles', async ({ page }) => {
      await page.goto('/');

      // Wait for the game loop to be available, then stop it
      await page.waitForFunction(
        () =>
          (window as unknown as { __gameLoop?: unknown }).__gameLoop !==
          undefined,
      );
      await page.evaluate(() => {
        (
          window as unknown as { __gameLoop: { stop: () => void } }
        ).__gameLoop.stop();
      });

      // Load, render, and extract pixel data in the browser context
      const result = await page.evaluate(
        async (args: { file: string; tileSize: number }): Promise<RenderResult> => {
          const { file, tileSize } = args;
          const { loadMap } = await import('/src/maps/map-loader.ts');
          const { renderMap } = await import('/src/maps/map-renderer.ts');
          const { Renderer } = await import('/src/renderer/renderer.ts');

          const response = await fetch(`/data/maps/${file}`);
          const mapData = await response.json();
          const map = loadMap(mapData as object);

          const canvas = document.getElementById('game') as HTMLCanvasElement;
          const renderer = new Renderer(canvas, {
            tileSize,
            mapWidth: map.width,
            mapHeight: map.height,
          });

          renderer.clear();
          renderMap(renderer, map, { tileSize });

          const ctx = canvas.getContext('2d')!;
          const dpr = window.devicePixelRatio || 1;

          function getPixelAtTile(
            tileX: number,
            tileY: number,
          ): PixelColor {
            const px = Math.floor((tileX * tileSize + tileSize / 2) * dpr);
            const py = Math.floor((tileY * tileSize + tileSize / 2) * dpr);
            const data = ctx.getImageData(px, py, 1, 1).data;
            return {
              r: data[0] ?? 0,
              g: data[1] ?? 0,
              b: data[2] ?? 0,
              a: data[3] ?? 0,
            };
          }

          // Collect start/end tiles to exclude from path pixel check
          const startEndTiles = new Set<string>();
          for (const sp of map.startPoints) {
            startEndTiles.add(`${sp.x},${sp.y}`);
          }
          startEndTiles.add(`${map.endPoint.x},${map.endPoint.y}`);

          // Find a path tile (not start/end) and a non-path tile
          let pathPixel: PixelColor | null = null;
          let nonPathPixel: PixelColor | null = null;

          for (
            let y = 0;
            y < map.height && (!pathPixel || !nonPathPixel);
            y++
          ) {
            for (
              let x = 0;
              x < map.width && (!pathPixel || !nonPathPixel);
              x++
            ) {
              const isPath = map.isPathTile(x, y);
              const isStartEnd = startEndTiles.has(`${x},${y}`);

              if (isPath && !isStartEnd && !pathPixel) {
                pathPixel = getPixelAtTile(x, y);
              } else if (!isPath && !nonPathPixel) {
                nonPathPixel = getPixelAtTile(x, y);
              }
            }
          }

          return {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            expectedWidth: Math.round(map.width * tileSize * dpr),
            expectedHeight: Math.round(map.height * tileSize * dpr),
            pathPixel,
            nonPathPixel,
          };
        },
        { file: mapFile, tileSize: TILE_SIZE },
      );

      // Verify canvas dimensions match map dimensions
      expect(result.canvasWidth).toBe(result.expectedWidth);
      expect(result.canvasHeight).toBe(result.expectedHeight);

      // Verify path and non-path pixels exist and are different colors
      expect(result.pathPixel).not.toBeNull();
      expect(result.nonPathPixel).not.toBeNull();

      const pp = result.pathPixel!;
      const np = result.nonPathPixel!;
      const colorsDiffer =
        pp.r !== np.r || pp.g !== np.g || pp.b !== np.b;
      expect(colorsDiffer).toBe(true);
    });

    test('map renders within canvas bounds', async ({ page }) => {
      await page.goto('/');

      // Wait for the game loop to be available, then stop it
      await page.waitForFunction(
        () =>
          (window as unknown as { __gameLoop?: unknown }).__gameLoop !==
          undefined,
      );
      await page.evaluate(() => {
        (
          window as unknown as { __gameLoop: { stop: () => void } }
        ).__gameLoop.stop();
      });

      const result = await page.evaluate(
        async (args: { file: string; tileSize: number }): Promise<{
          canvasWidth: number;
          canvasHeight: number;
          mapWidth: number;
          mapHeight: number;
          dpr: number;
        }> => {
          const { file, tileSize } = args;
          const { loadMap } = await import('/src/maps/map-loader.ts');
          const { renderMap } = await import('/src/maps/map-renderer.ts');
          const { Renderer } = await import('/src/renderer/renderer.ts');

          const response = await fetch(`/data/maps/${file}`);
          const mapData = await response.json();
          const map = loadMap(mapData as object);

          const canvas = document.getElementById('game') as HTMLCanvasElement;
          const renderer = new Renderer(canvas, {
            tileSize,
            mapWidth: map.width,
            mapHeight: map.height,
          });

          renderer.clear();
          renderMap(renderer, map, { tileSize });

          const dpr = window.devicePixelRatio || 1;

          return {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            mapWidth: map.width,
            mapHeight: map.height,
            dpr,
          };
        },
        { file: mapFile, tileSize: TILE_SIZE },
      );

      // Canvas backing store must be at least as large as the map
      const minWidth = result.mapWidth * TILE_SIZE * result.dpr;
      const minHeight = result.mapHeight * TILE_SIZE * result.dpr;
      expect(result.canvasWidth).toBeGreaterThanOrEqual(minWidth);
      expect(result.canvasHeight).toBeGreaterThanOrEqual(minHeight);
    });
  });
}

