import { test, expect, type Page } from '@playwright/test';

const TILE_SIZE = 32;

// Colors from tower-ui.ts
const PANEL_BORDER: RGB = { r: 74, g: 144, b: 217 }; // #4a90d9
const CANNON_COLOR: RGB = { r: 217, g: 116, b: 74 }; // #d9744a

// Panel position for tile (2, 5)
const PANEL_X = (2 + 1) * TILE_SIZE; // 96
const PANEL_Y = 5 * TILE_SIZE; // 160

// Tower center for tile (2, 5) — inset 4px, 24x24 rect
const TOWER_X = 2 * TILE_SIZE + 14; // 78
const TOWER_Y = 5 * TILE_SIZE + 14; // 174

interface RGB {
  r: number;
  g: number;
  b: number;
}

async function startGame(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { isDataLoaded: () => boolean } })
        .__game?.isDataLoaded() === true,
  );
  await page.evaluate(() => {
    (window as unknown as { __startGame: (d: string, m: string) => boolean })
      .__startGame('easy', 'map_single_path');
  });
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getState: () => string } })
        .__game?.getState() === 'WAVE_PREP',
  );
}

async function waitForGameSystems(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (window as unknown as { __towerManager?: unknown }).__towerManager !==
        undefined &&
      (window as unknown as { __towerUI?: unknown }).__towerUI !== undefined &&
      (window as unknown as { __economyManager?: unknown }).__economyManager !==
        undefined,
  );
}

async function tapTile(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ x, y }) => {
      const ui = (
        window as unknown as {
          __towerUI: { handleTileTap: (tile: { x: number; y: number }) => void };
        }
      ).__towerUI;
      ui.handleTileTap({ x, y });
    },
    { x, y },
  );
}

async function waitForPixel(
  page: Page,
  x: number,
  y: number,
  expected: RGB,
): Promise<void> {
  await page.waitForFunction(
    ({ x, y, expected }) => {
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      const data = ctx.getImageData(
        Math.floor(x * dpr),
        Math.floor(y * dpr),
        1,
        1,
      ).data;
      return (
        data[0] === expected.r &&
        data[1] === expected.g &&
        data[2] === expected.b
      );
    },
    { x, y, expected },
  );
}

async function waitForPixelNot(
  page: Page,
  x: number,
  y: number,
  unexpected: RGB,
): Promise<void> {
  await page.waitForFunction(
    ({ x, y, unexpected }) => {
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      const data = ctx.getImageData(
        Math.floor(x * dpr),
        Math.floor(y * dpr),
        1,
        1,
      ).data;
      return !(
        data[0] === unexpected.r &&
        data[1] === unexpected.g &&
        data[2] === unexpected.b
      );
    },
    { x, y, unexpected },
  );
}

test('build panel appears when tapping a buildable tile', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await waitForGameSystems(page);

  // Tap buildable tile (2, 5)
  await tapTile(page, 2, 5);

  // Wait for panel border at top edge
  await waitForPixel(page, PANEL_X + 10, PANEL_Y + 1, PANEL_BORDER);

  // Verify UI state
  const state = await page.evaluate(() => {
    const ui = (
      window as unknown as {
        __towerUI: {
          panelMode: string;
          selectedTile: { x: number; y: number } | null;
        };
      }
    ).__towerUI;
    return { panelMode: ui.panelMode, selectedTile: ui.selectedTile };
  });
  expect(state.panelMode).toBe('build');
  expect(state.selectedTile).toEqual({ x: 2, y: 5 });
});

test('tower appears at tile position after selecting from build panel', async ({
  page,
}) => {
  await page.goto('/');
  await startGame(page);
  await waitForGameSystems(page);

  // Tap buildable tile (2, 5) to show build panel
  await tapTile(page, 2, 5);

  // Select cannon (second row) by tapping tile (3, 7)
  // Row 2 starts at y = 160 + 28 + 6 + 32 = 226
  // Tile (3, 7) has pixel center at (112, 240) — within row 2
  await tapTile(page, 3, 7);

  // Wait for cannon color at tower position
  await waitForPixel(page, TOWER_X, TOWER_Y, CANNON_COLOR);

  // Verify tower exists in manager
  const towerExists = await page.evaluate(() => {
    const manager = (
      window as unknown as {
        __towerManager: { getTowerAt: (x: number, y: number) => unknown };
      }
    ).__towerManager;
    return manager.getTowerAt(2, 5) !== null;
  });
  expect(towerExists).toBe(true);
});

test('info panel appears when tapping an existing tower', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await waitForGameSystems(page);

  // Place a cannon at (2, 5)
  await tapTile(page, 2, 5);
  await tapTile(page, 3, 7);

  // Wait for tower to appear
  await waitForPixel(page, TOWER_X, TOWER_Y, CANNON_COLOR);

  // Tap the existing tower to show info panel
  await tapTile(page, 2, 5);

  // Wait for info panel border
  await waitForPixel(page, PANEL_X + 10, PANEL_Y + 1, PANEL_BORDER);

  // Verify UI state
  const state = await page.evaluate(() => {
    const ui = (
      window as unknown as { __towerUI: { panelMode: string } }
    ).__towerUI;
    return { panelMode: ui.panelMode };
  });
  expect(state.panelMode).toBe('info');
});

test('tower is removed from canvas after selling', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await waitForGameSystems(page);

  // Place a cannon at (2, 5)
  await tapTile(page, 2, 5);
  await tapTile(page, 3, 7);

  // Wait for tower to appear
  await waitForPixel(page, TOWER_X, TOWER_Y, CANNON_COLOR);

  // Tap the existing tower to show info panel
  await tapTile(page, 2, 5);

  // Wait for info panel to appear
  await waitForPixel(page, PANEL_X + 10, PANEL_Y + 1, PANEL_BORDER);

  // Tap sell button — tile (7, 10) maps to pixel center (240, 336)
  // Sell button bounds: x=[221, 311], y=[332, 364]
  await tapTile(page, 7, 10);

  // Wait for tower color to be gone
  await waitForPixelNot(page, TOWER_X, TOWER_Y, CANNON_COLOR);

  // Verify tower is removed from manager
  const towerExists = await page.evaluate(() => {
    const manager = (
      window as unknown as {
        __towerManager: { getTowerAt: (x: number, y: number) => unknown };
      }
    ).__towerManager;
    return manager.getTowerAt(2, 5) !== null;
  });
  expect(towerExists).toBe(false);
});

