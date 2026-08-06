import type { Renderer } from '../renderer/renderer';
import type { SpriteCache } from '../renderer/sprite-loader';
import type { TowerManager } from './tower-manager';
import type { EconomyManager } from '../economy/economy-manager';
import type { TowerData, TowerUITheme } from '../logic/types';
import type { Tower } from './tower';
import type { TilePoint } from '../input/coordinates';
import { calculateDPS, calculateCostPerDPS } from '../logic/damage';

// Panel visual constants
const PANEL_BG = 'rgba(15, 15, 30, 0.95)';
const PANEL_BORDER = '#4a90d9';
const PANEL_TEXT = '#e0e0e0';
const PANEL_TEXT_DIM = '#888';
const BUTTON_BG = '#3a5a8a';
const BUTTON_BG_DISABLED = 'rgba(58, 90, 138, 0.4)';
const BUTTON_TEXT = '#fff';

// Tower colors for canvas rendering
export const TOWER_COLORS: Record<string, string> = {
  gatling: '#4a90d9',
  cannon: '#d9744a',
  frost: '#4ad9d0',
  poison: '#9ad94a',
  sniper: '#d94a8a',
  aura: '#d9d04a',
  economy: '#4ad97a',
};

// Layout constants
const ROW_HEIGHT = 32;
const PANEL_PADDING = 6;
const TITLE_HEIGHT = 28;
const BUTTON_HEIGHT = 32;
const BUTTON_WIDTH = 90;
const INFO_LINE_HEIGHT = 22;
const BUILD_PANEL_WIDTH = 260;
const INFO_PANEL_WIDTH = 240;

// Game area bounds — panels must stay within this vertical region
// to avoid overlapping the HUD button row at the bottom of the canvas.
const GAME_AREA_TOP = 32;
const GAME_AREA_BOTTOM = 448;

export type PanelMode = 'none' | 'build' | 'info';

export interface TowerUIState {
  panelMode: PanelMode;
  selectedTile: TilePoint | null;
  selectedTowerId: string | null;
}

/** A button's bounds in canvas coordinates for hit-testing. */
interface ButtonBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A build panel row's bounds and associated archetype. */
interface BuildRow {
  y: number;
  h: number;
  archetype: TowerData;
}

/**
 * Canvas-rendered UI for tower placement, upgrade, and sell.
 * Uses WI-3's Renderer drawRect/drawText — no HTML DOM elements.
 * Integrates with WI-4's InputManager via onTileTap.
 */
export class TowerUI {
  private renderer: Renderer;
  private towerManager: TowerManager;
  private economyManager: EconomyManager;
  private archetypes: TowerData[];
  private tileSize: number;
  private mapWidthPx: number;
  private spriteCache: SpriteCache | null;
  private towerUITheme: TowerUITheme | null = null;

  panelMode: PanelMode = 'none';
  selectedTile: TilePoint | null = null;
  selectedTowerId: string | null = null;
  hoverTile: TilePoint | null = null;

  // Panel position in canvas coordinates
  private panelX = 0;
  private panelY = 0;
  private panelWidth = 0;
  private panelHeight = 0;

  // Hit-test data
  private buildRows: BuildRow[] = [];
  private upgradeButton: ButtonBounds | null = null;
  private sellButton: ButtonBounds | null = null;

  constructor(
    renderer: Renderer,
    towerManager: TowerManager,
    economyManager: EconomyManager,
    archetypes: TowerData[],
    tileSize: number,
    mapWidthTiles: number,
    spriteCache?: SpriteCache | null,
  ) {
    this.renderer = renderer;
    this.towerManager = towerManager;
    this.economyManager = economyManager;
    this.archetypes = archetypes;
    this.tileSize = tileSize;
    this.mapWidthPx = mapWidthTiles * tileSize;
    this.spriteCache = spriteCache ?? null;
  }

  /** Set theme overrides for panel colors and tower colors. */
  setTheme(theme: TowerUITheme | null): void {
    this.towerUITheme = theme;
  }

  getState(): TowerUIState {
    return {
      panelMode: this.panelMode,
      selectedTile: this.selectedTile,
      selectedTowerId: this.selectedTowerId,
    };
  }

  dismissPanel(): void {
    this.panelMode = 'none';
    this.selectedTile = null;
    this.selectedTowerId = null;
    this.hoverTile = null;
    this.buildRows = [];
    this.upgradeButton = null;
    this.sellButton = null;
  }

  /** Update the hovered tile for ghost preview and range circle display. */
  setHoverTile(tile: TilePoint | null): void {
    this.hoverTile = tile;
  }

  /**
   * Handles a tile tap from the InputManager.
   * If a panel is active, checks for button/row taps.
   * If no panel is active, shows a build or info panel.
   */
  handleTileTap(tile: TilePoint): void {
    if (this.panelMode === 'build') {
      const archetype = this.hitTestBuildPanel(tile);
      if (archetype) {
        this.selectArchetype(archetype);
        return;
      }
      this.dismissPanel();
      return;
    }

    if (this.panelMode === 'info') {
      if (this.hitTestButton(this.upgradeButton, tile)) {
        this.handleUpgrade();
        return;
      }
      if (this.hitTestButton(this.sellButton, tile)) {
        this.handleSell();
        return;
      }
      this.dismissPanel();
      return;
    }

    // No panel active — determine what to show
    const tower = this.towerManager.getTowerAt(tile.x, tile.y);
    if (tower) {
      this.showInfoPanel(tile, tower);
    } else if (this.towerManager.isBuildable(tile.x, tile.y)) {
      this.showBuildPanel(tile);
    }
  }

  private showBuildPanel(tile: TilePoint): void {
    this.panelMode = 'build';
    this.selectedTile = tile;
    this.selectedTowerId = null;

    this.panelX = (tile.x + 1) * this.tileSize;
    this.panelY = tile.y * this.tileSize;
    this.panelWidth = BUILD_PANEL_WIDTH;
    this.panelHeight = TITLE_HEIGHT + PANEL_PADDING * 2 + this.archetypes.length * ROW_HEIGHT;

    this.clampPanelToRight(tile);
    this.clampPanelToBottom();

    this.buildRows = [];
    let rowY = this.panelY + TITLE_HEIGHT + PANEL_PADDING;
    for (const archetype of this.archetypes) {
      this.buildRows.push({ y: rowY, h: ROW_HEIGHT, archetype });
      rowY += ROW_HEIGHT;
    }

    this.upgradeButton = null;
    this.sellButton = null;
  }

  private showInfoPanel(tile: TilePoint, tower: Tower): void {
    this.panelMode = 'info';
    this.selectedTile = tile;
    this.selectedTowerId = tower.id;

    this.panelX = (tile.x + 1) * this.tileSize;
    this.panelY = tile.y * this.tileSize;
    this.panelWidth = INFO_PANEL_WIDTH;

    const infoLines = 6;
    this.panelHeight =
      TITLE_HEIGHT +
      PANEL_PADDING * 2 +
      infoLines * INFO_LINE_HEIGHT +
      BUTTON_HEIGHT +
      PANEL_PADDING;

    this.clampPanelToRight(tile);
    this.clampPanelToBottom();

    const buttonY =
      this.panelY +
      TITLE_HEIGHT +
      PANEL_PADDING +
      infoLines * INFO_LINE_HEIGHT +
      PANEL_PADDING;
    const buttonGap = 10;
    const totalButtonWidth = BUTTON_WIDTH * 2 + buttonGap;
    const buttonStartX = this.panelX + (this.panelWidth - totalButtonWidth) / 2;
    this.upgradeButton = { x: buttonStartX, y: buttonY, w: BUTTON_WIDTH, h: BUTTON_HEIGHT };
    this.sellButton = {
      x: buttonStartX + BUTTON_WIDTH + buttonGap,
      y: buttonY,
      w: BUTTON_WIDTH,
      h: BUTTON_HEIGHT,
    };

    this.buildRows = [];
  }

  /** If panel would overflow the right edge, flip it to the left of the tile. */
  private clampPanelToRight(tile: TilePoint): void {
    if (this.panelX + this.panelWidth > this.mapWidthPx) {
      this.panelX = tile.x * this.tileSize - this.panelWidth;
      if (this.panelX < 0) this.panelX = 0;
    }
  }

  /** If panel would overflow the bottom of the game area, shift it up. */
  private clampPanelToBottom(): void {
    if (this.panelY + this.panelHeight > GAME_AREA_BOTTOM) {
      this.panelY = GAME_AREA_BOTTOM - this.panelHeight;
    }
    if (this.panelY < GAME_AREA_TOP) {
      this.panelY = GAME_AREA_TOP;
    }
  }

  private selectArchetype(archetype: TowerData): void {
    if (!this.selectedTile) return;
    const gold = this.economyManager.getGold();
    const result = this.towerManager.placeTower(
      archetype,
      this.selectedTile.x,
      this.selectedTile.y,
      gold,
    );
    if (result.success) {
      const tier1 = archetype.logic.tiers.find((t) => t.tier === 1);
      if (tier1) this.economyManager.spendGold(tier1.cost);
    }
    this.dismissPanel();
  }

  private handleUpgrade(): void {
    if (!this.selectedTowerId) return;
    const gold = this.economyManager.getGold();
    const tower = this.towerManager.getAllTowers().find((t) => t.id === this.selectedTowerId);
    if (!tower) return;
    const cost = tower.getUpgradeCost();
    const result = this.towerManager.upgradeTower(this.selectedTowerId, gold);
    if (result.success) {
      this.economyManager.spendGold(cost);
    }
    // Keep panel open to show updated info
  }

  private handleSell(): void {
    if (!this.selectedTowerId) return;
    const result = this.towerManager.sellTower(this.selectedTowerId);
    this.economyManager.addGold(result.refundAmount);
    this.dismissPanel();
  }

  private hitTestBuildPanel(tile: TilePoint): TowerData | null {
    const tapX = tile.x * this.tileSize + this.tileSize / 2;
    const tapY = tile.y * this.tileSize + this.tileSize / 2;
    for (const row of this.buildRows) {
      if (
        tapY >= row.y &&
        tapY < row.y + row.h &&
        tapX >= this.panelX &&
        tapX < this.panelX + this.panelWidth
      ) {
        return row.archetype;
      }
    }
    return null;
  }

  private hitTestButton(button: ButtonBounds | null, tile: TilePoint): boolean {
    if (!button) return false;
    const tapX = tile.x * this.tileSize + this.tileSize / 2;
    const tapY = tile.y * this.tileSize + this.tileSize / 2;
    return (
      tapX >= button.x &&
      tapX < button.x + button.w &&
      tapY >= button.y &&
      tapY < button.y + button.h
    );
  }

  /**
   * Renders range circles, ghost previews, and the active panel on the canvas.
   * Call after rendering the map and towers.
   */
  render(): void {
    if (this.panelMode === 'build') {
      this.renderBuildOverlay();
      this.renderBuildPanel();
    } else if (this.panelMode === 'info') {
      this.renderInfoOverlay();
      this.renderInfoPanel();
    }
  }

  // ── Range circle + ghost preview overlays ─────────────────────

  /** Range circle fill and outline color. */
  private static readonly RANGE_FILL = 'rgba(100, 200, 255, 1)';
  private static readonly RANGE_OUTLINE = 'rgba(100, 200, 255, 1)';
  private static readonly GHOST_VALID = '#51cf66';
  private static readonly GHOST_INVALID = '#ff6b6b';

  /** Draw a semi-transparent range circle centered on a tile. */
  private drawRangeCircle(tileX: number, tileY: number, range: number): void {
    const cx = tileX * this.tileSize + this.tileSize / 2;
    const cy = tileY * this.tileSize + this.tileSize / 2;
    const radius = range * this.tileSize;

    this.renderer.save();
    this.renderer.setAlpha(0.2);
    this.renderer.drawCircle(cx, cy, radius, TowerUI.RANGE_FILL);
    this.renderer.restore();

    this.renderer.drawStrokeCircle(cx, cy, radius, TowerUI.RANGE_OUTLINE, 2);
  }

  /** Draw a semi-transparent ghost tower sprite at the hovered tile. */
  private drawGhostPreview(tile: TilePoint, archetype: TowerData): void {
    const x = tile.x * this.tileSize;
    const y = tile.y * this.tileSize;

    const spritePath = archetype.presentation?.sprite;
    const sprite = spritePath ? this.spriteCache?.get(spritePath) : null;

    this.renderer.save();
    this.renderer.setAlpha(0.5);
    if (sprite) {
      this.renderer.drawSprite(sprite, x, y, this.tileSize, this.tileSize);
    } else {
      const color = this.getTowerColor(archetype.archetype);
      const inset = 4;
      this.renderer.drawRect(
        x + inset,
        y + inset,
        this.tileSize - inset * 2,
        this.tileSize - inset * 2,
        color,
      );
    }
    this.renderer.restore();
  }

  /** Draw a colored border around a tile (green = valid, red = invalid). */
  private drawTileBorder(tile: TilePoint, color: string): void {
    this.renderer.drawStrokeRect(
      tile.x * this.tileSize,
      tile.y * this.tileSize,
      this.tileSize,
      this.tileSize,
      color,
      2,
    );
  }

  /** Render range circle and ghost preview when the build panel is open. */
  private renderBuildOverlay(): void {
    if (!this.selectedTile) return;

    // Only show range circle and ghost preview when the user is hovering
    // over a specific tower type in the build panel. Without a specific
    // tower type, showing a range circle is misleading — it implies a
    // tower placement intent that doesn't exist yet.
    const hoveredArchetype = this.getHoveredArchetype();
    if (!hoveredArchetype) return;

    const tier1 = hoveredArchetype.logic.tiers.find((t) => t.tier === 1);
    if (tier1) {
      this.drawRangeCircle(this.selectedTile.x, this.selectedTile.y, tier1.range);
    }

    // Ghost preview at the selected tile shows what the hovered tower type
    // would look like if placed there.
    this.drawGhostPreview(this.selectedTile, hoveredArchetype);

    const buildable =
      this.towerManager.isBuildable(this.selectedTile.x, this.selectedTile.y) &&
      !this.towerManager.isTileOccupied(this.selectedTile.x, this.selectedTile.y);
    this.drawTileBorder(
      this.selectedTile,
      buildable ? TowerUI.GHOST_VALID : TowerUI.GHOST_INVALID,
    );
  }

  /** Render range circle when a tower is selected (info panel). */
  private renderInfoOverlay(): void {
    if (!this.selectedTowerId) return;
    const tower = this.towerManager
      .getAllTowers()
      .find((t) => t.id === this.selectedTowerId);
    if (!tower) return;

    this.drawRangeCircle(tower.tileX, tower.tileY, tower.effectiveRange);
  }

  /** Check if the hover tile falls within a build panel row and return that archetype. */
  private getHoveredArchetype(): TowerData | null {
    if (!this.hoverTile) return null;
    const tapX = this.hoverTile.x * this.tileSize + this.tileSize / 2;
    const tapY = this.hoverTile.y * this.tileSize + this.tileSize / 2;
    for (const row of this.buildRows) {
      if (
        tapY >= row.y &&
        tapY < row.y + row.h &&
        tapX >= this.panelX &&
        tapX < this.panelX + this.panelWidth
      ) {
        return row.archetype;
      }
    }
    return null;
  }

  /** Resolve tower color from theme or default. */
  private getTowerColor(archetype: string): string {
    return this.towerUITheme?.towerColors[archetype] ?? TOWER_COLORS[archetype] ?? '#888';
  }

  private drawPanelBorder(): void {
    const border = this.towerUITheme?.panelBorder ?? PANEL_BORDER;
    this.renderer.drawRect(this.panelX, this.panelY, this.panelWidth, 2, border);
    this.renderer.drawRect(
      this.panelX,
      this.panelY + this.panelHeight - 2,
      this.panelWidth,
      2,
      border,
    );
    this.renderer.drawRect(this.panelX, this.panelY, 2, this.panelHeight, border);
    this.renderer.drawRect(
      this.panelX + this.panelWidth - 2,
      this.panelY,
      2,
      this.panelHeight,
      border,
    );
  }

  private renderBuildPanel(): void {
    this.renderer.drawRect(
      this.panelX,
      this.panelY,
      this.panelWidth,
      this.panelHeight,
      this.towerUITheme?.panelBg ?? PANEL_BG,
    );
    this.drawPanelBorder();

    this.renderer.drawText('Build Tower', this.panelX + PANEL_PADDING, this.panelY + TITLE_HEIGHT - 8, {
      color: PANEL_TEXT,
      font: 'bold 16px sans-serif',
    });

    let rowY = this.panelY + TITLE_HEIGHT + PANEL_PADDING;
    for (let i = 0; i < this.archetypes.length; i++) {
      const archetype = this.archetypes[i]!;
      const tier1 = archetype.logic.tiers.find((t) => t.tier === 1);
      if (!tier1) continue;

      // Alternating row background
      if (i % 2 === 0) {
        this.renderer.drawRect(
          this.panelX + 2,
          rowY,
          this.panelWidth - 4,
          ROW_HEIGHT,
          'rgba(255,255,255,0.05)',
        );
      }

      // Sprite icon with affordability dimming
      const iconX = this.panelX + PANEL_PADDING;
      const iconY = rowY + 6;
      const iconSize = ROW_HEIGHT - 12;
      const affordable = this.economyManager.getGold() >= tier1.cost;
      const spritePath = archetype.presentation?.sprite;
      const sprite = spritePath ? this.spriteCache?.get(spritePath) : null;

      this.renderer.save();
      if (!affordable) this.renderer.setAlpha(0.4);
      if (sprite) {
        this.renderer.drawSprite(sprite, iconX, iconY, iconSize, iconSize);
      } else {
        const color = this.getTowerColor(archetype.archetype);
        this.renderer.drawRect(iconX, iconY, iconSize, iconSize, color);
      }
      this.renderer.restore();

      // Name
      const name = archetype.presentation?.name ?? archetype.archetype;
      this.renderer.drawText(name, this.panelX + PANEL_PADDING + 28, rowY + 14, {
        color: PANEL_TEXT,
        font: '13px sans-serif',
      });

      // Cost
      this.renderer.drawText(`${tier1.cost}g`, this.panelX + PANEL_PADDING + 28, rowY + 28, {
        color: PANEL_TEXT_DIM,
        font: '11px sans-serif',
      });

      // Cost per DPS — the "invisible math" made visible
      const dps =
        tier1.damage > 0 && tier1.cooldown > 0 ? calculateDPS(tier1.damage, tier1.cooldown) : 0;
      const cpd = dps > 0 ? calculateCostPerDPS(tier1.cost, dps).toFixed(1) : 'N/A';
      this.renderer.drawText(`${cpd} g/DPS`, this.panelX + this.panelWidth - 90, rowY + 20, {
        color: dps > 0 ? '#e8e8e8' : PANEL_TEXT_DIM,
        font: '11px sans-serif',
      });

      rowY += ROW_HEIGHT;
    }
  }

  private renderInfoPanel(): void {
    const tower = this.selectedTowerId
      ? this.towerManager.getAllTowers().find((t) => t.id === this.selectedTowerId)
      : null;
    if (!tower) {
      this.dismissPanel();
      return;
    }

    this.renderer.drawRect(
      this.panelX,
      this.panelY,
      this.panelWidth,
      this.panelHeight,
      this.towerUITheme?.panelBg ?? PANEL_BG,
    );
    this.drawPanelBorder();

    let lineY = this.panelY + TITLE_HEIGHT + PANEL_PADDING;

    // Tower name
    this.renderer.drawText(tower.getDisplayName(), this.panelX + PANEL_PADDING, lineY, {
      color: PANEL_TEXT,
      font: 'bold 15px sans-serif',
    });
    lineY += INFO_LINE_HEIGHT;

    // Tier
    this.renderer.drawText(`Tier ${tower.tier}/3`, this.panelX + PANEL_PADDING, lineY, {
      color: PANEL_TEXT,
      font: '13px sans-serif',
    });
    lineY += INFO_LINE_HEIGHT;

    // DPS
    const dps = tower.getDPS();
    this.renderer.drawText(
      `DPS: ${dps > 0 ? dps.toFixed(1) : 'N/A'}`,
      this.panelX + PANEL_PADDING,
      lineY,
      { color: dps > 0 ? PANEL_TEXT : PANEL_TEXT_DIM, font: '13px sans-serif' },
    );
    lineY += INFO_LINE_HEIGHT;

    // Cost per DPS
    const cpd = tower.getCostPerDPS();
    this.renderer.drawText(
      `Cost/DPS: ${cpd > 0 ? cpd.toFixed(1) : 'N/A'}`,
      this.panelX + PANEL_PADDING,
      lineY,
      { color: cpd > 0 ? PANEL_TEXT : PANEL_TEXT_DIM, font: '13px sans-serif' },
    );
    lineY += INFO_LINE_HEIGHT;

    // Upgrade cost
    if (tower.canUpgrade()) {
      this.renderer.drawText(
        `Upgrade: ${tower.getUpgradeCost()}g`,
        this.panelX + PANEL_PADDING,
        lineY,
        { color: PANEL_TEXT, font: '13px sans-serif' },
      );
    } else {
      this.renderer.drawText('Max Tier', this.panelX + PANEL_PADDING, lineY, {
        color: PANEL_TEXT_DIM,
        font: '13px sans-serif',
      });
    }
    lineY += INFO_LINE_HEIGHT;

    // Sell value
    this.renderer.drawText(
      `Sell: ${tower.getSellValue()}g`,
      this.panelX + PANEL_PADDING,
      lineY,
      { color: PANEL_TEXT, font: '13px sans-serif' },
    );

    // Buttons
    if (this.upgradeButton) {
      const canUpgrade =
        tower.canUpgrade() && this.economyManager.getGold() >= tower.getUpgradeCost();
      this.renderer.drawRect(
        this.upgradeButton.x,
        this.upgradeButton.y,
        this.upgradeButton.w,
        this.upgradeButton.h,
        canUpgrade ? BUTTON_BG : BUTTON_BG_DISABLED,
      );
      this.renderer.drawText('Upgrade', this.upgradeButton.x + 15, this.upgradeButton.y + 20, {
        color: canUpgrade ? BUTTON_TEXT : PANEL_TEXT_DIM,
        font: '13px sans-serif',
      });
    }

    if (this.sellButton) {
      this.renderer.drawRect(
        this.sellButton.x,
        this.sellButton.y,
        this.sellButton.w,
        this.sellButton.h,
        BUTTON_BG,
      );
      this.renderer.drawText('Sell', this.sellButton.x + 28, this.sellButton.y + 20, {
        color: BUTTON_TEXT,
        font: '13px sans-serif',
      });
    }
  }
}

