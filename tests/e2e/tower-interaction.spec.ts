import { test, expect, type Page } from '@playwright/test';

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
      (window as unknown as { __towerManager?: unknown }).__towerManager !== undefined &&
      (window as unknown as { __towerUI?: unknown }).__towerUI !== undefined &&
      (window as unknown as { __economyManager?: unknown }).__economyManager !== undefined,
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

async function setHoverTile(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ x, y }) => {
      const ui = (
        window as unknown as {
          __towerUI: { setHoverTile: (tile: { x: number; y: number } | null) => void };
        }
      ).__towerUI;
      ui.setHoverTile({ x, y });
    },
    { x, y },
  );
}

// ── Range circle on placement hover ─────────────────────────────

test('range circle appears when build panel is open on a buildable tile', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await waitForGameSystems(page);

  // Tap buildable tile (2, 5) to open build panel
  await tapTile(page, 2, 5);

  // Range circle center: (2*32 + 16, 5*32 + 16) = (80, 176)
  // Gatling range 2.5 → radius 80px. Check a pixel 50px above center
  // at (80, 126) — tile (2, 3), grass background.
  // With range circle fill (rgba(100,200,255) at alpha 0.2):
  // B ≈ 45*0.8 + 255*0.2 = 87, vs grass B = 45.
  await page.waitForFunction(
    () => {
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      const data = ctx.getImageData(
        Math.floor(80 * dpr),
        Math.floor(126 * dpr),
        1,
        1,
      ).data;
      // Range circle adds blue tint: B should be significantly > grass (45)
      return data[2]! > 70;
    },
    { timeout: 5000 },
  );

  // Verify panel is in build mode
  const mode = await page.evaluate(() => {
    return (window as unknown as { __towerUI: { panelMode: string } }).__towerUI.panelMode;
  });
  expect(mode).toBe('build');
});

// ── Range circle on tower selection ─────────────────────────────

test('range circle appears when a tower is selected (info panel)', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await waitForGameSystems(page);

  // Place a cannon at (2, 5)
  await tapTile(page, 2, 5);
  await tapTile(page, 3, 7);

  // Wait for tower to appear
  await page.waitForFunction(
    () => {
      const mgr = (
        window as unknown as { __towerManager: { getTowerAt: (x: number, y: number) => unknown } }
      ).__towerManager;
      return mgr.getTowerAt(2, 5) !== null;
    },
    { timeout: 5000 },
  );

  // Tap the tower to show info panel
  await tapTile(page, 2, 5);

  // Wait for info panel
  await page.waitForFunction(
    () => {
      return (window as unknown as { __towerUI: { panelMode: string } }).__towerUI.panelMode === 'info';
    },
    { timeout: 5000 },
  );

  // Cannon range 3.0 → radius 96px. Check pixel 60px above center at (80, 116)
  // Grass B = 45, with range circle B ≈ 45*0.8 + 255*0.2 = 87
  await page.waitForFunction(
    () => {
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      const data = ctx.getImageData(
        Math.floor(80 * dpr),
        Math.floor(116 * dpr),
        1,
        1,
      ).data;
      return data[2]! > 70;
    },
    { timeout: 5000 },
  );
});

// ── Ghost preview: green border on buildable tile ───────────────

test('ghost preview shows green border on buildable tile', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await waitForGameSystems(page);

  // Open build panel at (2, 5). Panel covers x=[96,356], y=[160,424].
  await tapTile(page, 2, 5);

  // Hover over (2, 9) — buildable tile outside the panel area
  await setHoverTile(page, 2, 9);

  // Check for green border at top-left corner of tile (2, 9)
  // Border at (2*32, 9*32) = (64, 288). x=64 < 96, outside panel.
  // Green: #51cf66 = RGB(81, 207, 102)
  await page.waitForFunction(
    () => {
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      const data = ctx.getImageData(
        Math.floor(64 * dpr),
        Math.floor(288 * dpr),
        1,
        1,
      ).data;
      const tol = 20;
      return (
        Math.abs(data[0]! - 81) < tol &&
        Math.abs(data[1]! - 207) < tol &&
        Math.abs(data[2]! - 102) < tol
      );
    },
    { timeout: 5000 },
  );
});

// ── Ghost preview: red border on non-buildable tile ─────────────

test('ghost preview shows red border on non-buildable tile', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await waitForGameSystems(page);

  // Open build panel at (2, 5). Panel covers x=[96,356], y=[160,424].
  await tapTile(page, 2, 5);

  // Hover over (1, 7) — path tile, non-buildable, outside panel area
  await setHoverTile(page, 1, 7);

  // Check for red border at top-left corner of tile (1, 7)
  // Border at (1*32, 7*32) = (32, 224). x=32 < 96, outside panel.
  // Red: #ff6b6b = RGB(255, 107, 107)
  await page.waitForFunction(
    () => {
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      const data = ctx.getImageData(
        Math.floor(32 * dpr),
        Math.floor(224 * dpr),
        1,
        1,
      ).data;
      const tol = 20;
      return (
        Math.abs(data[0]! - 255) < tol &&
        Math.abs(data[1]! - 107) < tol &&
        Math.abs(data[2]! - 107) < tol
      );
    },
    { timeout: 5000 },
  );
});

// ── Build panel sprite icons with pixel diversity ───────────────

test('build panel shows sprite icons with pixel diversity', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await waitForGameSystems(page);

  // Open build panel at (2, 5)
  await tapTile(page, 2, 5);

  // Wait for panel to render
  await page.waitForFunction(
    () => (window as unknown as { __towerUI: { panelMode: string } }).__towerUI.panelMode === 'build',
    { timeout: 5000 },
  );

  // Panel is at (96, 160). First row icon at (102, 200), size 20x20.
  // Wait for the sprite to render with pixel diversity. Sprites have
  // transparent pixels (showing panel bg) + multiple sprite colors,
  // giving ≥3 distinct colors. A flat drawRect fallback gives only 1.
  // Poll for diversity ≥3 so the test only proceeds once the sprite is drawn.
  await page.waitForFunction(
    () => {
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      const colors = new Set<string>();
      for (let dy = 0; dy < 20; dy += 2) {
        for (let dx = 0; dx < 20; dx += 2) {
          const px = Math.floor((102 + dx) * dpr);
          const py = Math.floor((200 + dy) * dpr);
          const data = ctx.getImageData(px, py, 1, 1).data;
          if (data[3]! > 0) {
            colors.add(`${data[0]},${data[1]},${data[2]}`);
          }
        }
      }
      return colors.size >= 3;
    },
    { timeout: 5000 },
  );

  // Re-sample to assert the diversity value for the test report
  const diversity = await page.evaluate(() => {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const colors = new Set<string>();
    for (let dy = 0; dy < 20; dy += 2) {
      for (let dx = 0; dx < 20; dx += 2) {
        const px = Math.floor((102 + dx) * dpr);
        const py = Math.floor((200 + dy) * dpr);
        const data = ctx.getImageData(px, py, 1, 1).data;
        if (data[3]! > 0) {
          colors.add(`${data[0]},${data[1]},${data[2]}`);
        }
      }
    }
    return colors.size;
  });

  // Sprite icons produce ≥3 distinct colors; flat color squares produce 1-2
  expect(diversity).toBeGreaterThanOrEqual(3);
});

// ── Build panel affordability dimming ───────────────────────────

test('build panel dims unaffordable tower icons', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await waitForGameSystems(page);

  // Easy mode starts with 200 gold. Tower costs:
  // gatling=50, cannon=120, frost=80, poison=100, sniper=150, aura=90, economy=75
  // Archetype order (rows 0-6): gatling, cannon, frost, poison, sniper, aura, economy
  // TOWER_COLORS: gatling=#4a90d9, cannon=#d9744a, sniper=#d94a8a

  // Place gatling (50g) at (2, 5): tap (2, 5) to open panel, tap (3, 6) for row 0
  await tapTile(page, 2, 5);
  await tapTile(page, 3, 6);

  // Place gatling (50g) at (3, 5): tap (3, 5) to open panel, tap (4, 6) for row 0
  await tapTile(page, 3, 5);
  await tapTile(page, 4, 6);

  // 200 - 50 - 50 = 100g remaining. Sniper (150g) is unaffordable.
  await page.waitForFunction(
    () => {
      const econ = (
        window as unknown as { __economyManager: { getGold: () => number } }
      ).__economyManager;
      return econ.getGold() === 100;
    },
    { timeout: 5000 },
  );

  // Open build panel at (4, 5). Panel at (160, 160).
  await tapTile(page, 4, 5);

  await page.waitForFunction(
    () => (window as unknown as { __towerUI: { panelMode: string } }).__towerUI.panelMode === 'build',
    { timeout: 5000 },
  );

  // Wait for the gatling icon to render. Gatling is blue (#4a90d9, B=217).
  // Background has B ≈ 41. Sample a 20x20 area and check for any pixel
  // with B > 100, indicating the icon color is present.
  await page.waitForFunction(
    () => {
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      for (let dy = 0; dy < 20; dy += 4) {
        for (let dx = 0; dx < 20; dx += 4) {
          const data = ctx.getImageData(
            Math.floor((166 + dx) * dpr),
            Math.floor((200 + dy) * dpr),
            1, 1,
          ).data;
          if (data[2]! > 100) return true;
        }
      }
      return false;
    },
    { timeout: 5000 },
  );

  // Check individual pixels at icon centers.
  // Row 0 (gatling, 50g, affordable): icon center at (176, 210)
  // Row 1 (cannon, 120g, unaffordable): icon center at (176, 242)
  // Row 4 (sniper, 150g, unaffordable): icon center at (176, 338)
  //
  // Affordable icons render at full alpha → pixel ≈ TOWER_COLORS
  // Dimmed icons render at alpha 0.4 → pixel = color*0.4 + bg*0.6
  // Panel bg ≈ RGB(17,18,31). TOWER_COLORS: gatling=RGB(74,144,217), cannon=RGB(217,116,74)
  // Dimmed cannon ≈ RGB(98,57,48). Dimmed sniper ≈ RGB(105,47,80).
  const pixels = await page.evaluate(() => {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;

    function px(cx: number, cy: number): { r: number; g: number; b: number } {
      const d = ctx.getImageData(Math.floor(cx * dpr), Math.floor(cy * dpr), 1, 1).data;
      return { r: d[0]!, g: d[1]!, b: d[2]! };
    }

    // Gatling (affordable) — should be close to full TOWER_COLORS
    const gatling = px(176, 210);
    // Cannon (unaffordable, dimmed) — should be significantly darker
    const cannon = px(176, 242);

    return { gatling, cannon };
  });

  // Cannon (dimmed) should NOT match its full TOWER_COLORS (217,116,74).
  // At alpha 0.4, it blends toward panel bg: R≈98, G≈57, B≈48.
  // The R channel drops from 217 to ~98 — a large shift.
  // Gatling (affordable) should have R close to 74 (blue-ish, not red).
  // The key distinction: affordable gatling R=74 vs dimmed cannon R≈98,
  // but the critical check is that cannon R < 150 (well below full 217).
  expect(pixels.gatling.r).toBeLessThan(150);
  expect(pixels.cannon.r).toBeLessThan(150);
});

// ── Muzzle flash on tower fire ──────────────────────────────────

test('muzzle flash appears when a tower fires at an enemy', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await startGame(page);
  await waitForGameSystems(page);

  // Place gatling tower at (2, 5) — near path at y=7, range 2.5
  // Panel opens at (2, 5). To select gatling (first row), tap (3, 6)
  // which has pixel center (112, 208) — within row 1 [y=194..226, x=96..356]
  await tapTile(page, 2, 5);
  await tapTile(page, 3, 6);

  // Wait for tower to be placed
  await page.waitForFunction(
    () => {
      const mgr = (
        window as unknown as { __towerManager: { getTowerAt: (x: number, y: number) => unknown } }
      ).__towerManager;
      return mgr.getTowerAt(2, 5) !== null;
    },
    { timeout: 5000 },
  );

  // Start wave 1
  await page.evaluate(() => {
    (window as unknown as { __game: { startWave: () => void } }).__game.startWave();
  });

  // Wait for state to be WAVE_ACTIVE
  await page.waitForFunction(
    () =>
      (window as unknown as { __game?: { getState: () => string } })
        .__game?.getState() === 'WAVE_ACTIVE',
    { timeout: 5000 },
  );

  // Tower center: (2*32 + 16, 5*32 + 16) = (80, 176)
  // Muzzle flash is a bright circle (radius 5) offset ~9.6px toward target.
  // Gatling flash color: #ffeb3b = RGB(255, 235, 59)
  // Scan a 28x28 area around the tower center for bright yellow pixels.
  // The flash fades over 80ms (~5 frames), so waitForFunction with raf polling
  // should catch it.
  await page.waitForFunction(
    () => {
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;

      // Scan around tower center (80, 176) for bright yellow flash pixels
      for (let dy = -14; dy <= 14; dy += 2) {
        for (let dx = -14; dx <= 14; dx += 2) {
          const px = Math.floor((80 + dx) * dpr);
          const py = Math.floor((176 + dy) * dpr);
          const data = ctx.getImageData(px, py, 1, 1).data;
          // Bright yellow: high R, high G, low B
          if (data[0]! > 150 && data[1]! > 150 && data[2]! < 150) {
            return true;
          }
        }
      }
      return false;
    },
    { timeout: 30000 },
  );
});

