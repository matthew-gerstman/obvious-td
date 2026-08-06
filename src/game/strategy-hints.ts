import type { Renderer } from '../renderer/renderer';
import type { WaveTable, EnemyData, TowerData } from '../logic/types';

// ── Types ────────────────────────────────────────────────────────

/** Minimal info about a placed tower — enough to check capabilities. */
export interface PlacedTowerInfo {
  hitsAir: boolean;
  armorPiercing: boolean;
}

/** A single enemy entry in the strategy hint panel. */
export interface StrategyHint {
  enemyId: string;
  enemyName: string;
  counters: string[];
  isCritical: boolean;
  warningText: string | null;
}

/** Result of analyzing an upcoming wave. */
export interface StrategyHintResult {
  hints: StrategyHint[];
  hasCritical: boolean;
}

// ── Analysis ─────────────────────────────────────────────────────

/** Returns the tier-1 stats for a tower archetype, or null if missing. */
function getTier1(tower: TowerData) {
  return tower.logic.tiers.find((t) => t.tier === 1) ?? null;
}

/** Human-readable name for a tower archetype. */
function towerName(t: TowerData): string {
  return t.presentation?.name ?? t.archetype;
}

/** True if any placed tower satisfies the capability check. */
function hasCapability(
  placed: PlacedTowerInfo[],
  check: (info: PlacedTowerInfo) => boolean,
): boolean {
  return placed.some(check);
}

/**
 * Maps an enemy archetype to its recommended counter-tower names.
 * Recommendations are derived from tower capability flags (hitsAir,
 * armorPiercing, splashRadius, slowFactor) in the archetype data.
 */
function getCounterTowers(
  enemy: EnemyData,
  towerArchetypes: TowerData[],
): string[] {
  switch (enemy.archetype) {
    case 'flyer':
      return towerArchetypes
        .filter((t) => getTier1(t)?.hitsAir === true)
        .map(towerName);

    case 'armored':
      return towerArchetypes
        .filter((t) => getTier1(t)?.armorPiercing === true)
        .map(towerName);

    case 'swarm':
      // Splash damage handles clusters; rapid fire mops up survivors
      return towerArchetypes
        .filter(
          (t) => getTier1(t)?.splashRadius !== undefined || t.archetype === 'gatling',
        )
        .map(towerName);

    case 'runner':
      // Slow stops the rush; rapid fire finishes low-HP targets
      return towerArchetypes
        .filter(
          (t) => getTier1(t)?.slowFactor !== undefined || t.archetype === 'gatling',
        )
        .map(towerName);

    case 'boss':
      // Burst + armor-piercing + sustained DPS
      return towerArchetypes
        .filter((t) => {
          const tier1 = getTier1(t);
          if (!tier1) return false;
          return tier1.armorPiercing === true || t.archetype === 'gatling';
        })
        .map(towerName);

    case 'grunt':
    default:
      return ['Any combat tower'];
  }
}

/**
 * Determines whether an enemy type triggers a critical warning,
 * based on the player's currently placed towers.
 */
function checkCritical(
  enemy: EnemyData,
  placed: PlacedTowerInfo[],
): { critical: boolean; warningText: string | null } {
  switch (enemy.archetype) {
    case 'flyer': {
      const hasAntiAir = hasCapability(placed, (s) => s.hitsAir);
      return {
        critical: !hasAntiAir,
        warningText: hasAntiAir
          ? null
          : 'No anti-air towers! Build Cannon or Sniper',
      };
    }

    case 'armored': {
      const hasAP = hasCapability(placed, (s) => s.armorPiercing);
      return {
        critical: !hasAP,
        warningText: hasAP
          ? null
          : 'No armor-piercing towers! Build Sniper or Poison',
      };
    }

    case 'boss':
      return {
        critical: true,
        warningText: 'Boss wave! Focus fire with upgraded towers',
      };

    default:
      return { critical: false, warningText: null };
  }
}

/**
 * Analyzes the upcoming wave and returns strategy hints.
 * Returns null if the wave number is not found in the wave table.
 */
export function analyzeWave(
  waveNumber: number,
  waveTable: WaveTable,
  enemyArchetypes: Record<string, EnemyData>,
  towerArchetypes: TowerData[],
  placedTowers: PlacedTowerInfo[],
): StrategyHintResult | null {
  const waveEntry = waveTable.waves.find((w) => w.wave === waveNumber);
  if (!waveEntry) return null;

  const hints: StrategyHint[] = [];
  let hasCritical = false;

  for (const entry of waveEntry.enemies) {
    const enemyData = enemyArchetypes[entry.enemyId];
    if (!enemyData) continue;

    const enemyName = enemyData.presentation?.name ?? entry.enemyId;
    const counters = getCounterTowers(enemyData, towerArchetypes);
    const { critical, warningText } = checkCritical(enemyData, placedTowers);

    if (critical) hasCritical = true;

    hints.push({
      enemyId: entry.enemyId,
      enemyName,
      counters,
      isCritical: critical,
      warningText,
    });
  }

  if (hints.length === 0) return null;
  return { hints, hasCritical };
}

// ── Rendering ────────────────────────────────────────────────────

// Panel layout constants — positioned on the right side of the canvas
// to avoid overlapping tower UI build/info panels that appear at the
// tapped tile position on the left side.
const CANVAS_WIDTH = 640;
const PANEL_WIDTH = 300;
const PANEL_X = CANVAS_WIDTH - PANEL_WIDTH - 8; // 332 — right-aligned with 8px margin
const PANEL_Y = 82;
const PANEL_PADDING = 6;
const TITLE_HEIGHT = 20;
const ROW_GAP = 4;
const NAME_LINE_HEIGHT = 16;
const COUNTER_LINE_HEIGHT = 14;
const WARNING_LINE_HEIGHT = 14;

const PANEL_BG = 'rgba(15, 15, 30, 0.9)';
const PANEL_BORDER = '#4a90d9';
const TITLE_COLOR = '#e0e0e0';
const NAME_COLOR = '#e0e0e0';
const NAME_CRITICAL_COLOR = '#ff6b6b';
const COUNTER_COLOR = '#888';
const WARNING_COLOR = '#ff4444';

/**
 * Renders the strategy hint panel on the canvas.
 * Call during WAVE_PREP, before tower UI so interactive panels stay on top.
 */
export function renderStrategyHints(
  renderer: Renderer,
  result: StrategyHintResult,
): void {
  const { hints } = result;
  if (hints.length === 0) return;

  // Calculate dynamic panel height
  let contentHeight = TITLE_HEIGHT + ROW_GAP;
  for (const hint of hints) {
    contentHeight += NAME_LINE_HEIGHT + COUNTER_LINE_HEIGHT;
    if (hint.isCritical && hint.warningText) {
      contentHeight += WARNING_LINE_HEIGHT;
    }
    contentHeight += ROW_GAP;
  }
  const panelHeight = contentHeight + PANEL_PADDING * 2;

  // Panel background
  renderer.drawRect(PANEL_X, PANEL_Y, PANEL_WIDTH, panelHeight, PANEL_BG);

  // Panel border (4 sides)
  renderer.drawRect(PANEL_X, PANEL_Y, PANEL_WIDTH, 2, PANEL_BORDER);
  renderer.drawRect(PANEL_X, PANEL_Y + panelHeight - 2, PANEL_WIDTH, 2, PANEL_BORDER);
  renderer.drawRect(PANEL_X, PANEL_Y, 2, panelHeight, PANEL_BORDER);
  renderer.drawRect(PANEL_X + PANEL_WIDTH - 2, PANEL_Y, 2, panelHeight, PANEL_BORDER);

  // Title
  const titleY = PANEL_Y + PANEL_PADDING + TITLE_HEIGHT - 4;
  renderer.drawText('Strategy Hints', PANEL_X + PANEL_PADDING, titleY, {
    color: TITLE_COLOR,
    font: 'bold 14px sans-serif',
  });

  // Each hint row
  let rowY = PANEL_Y + PANEL_PADDING + TITLE_HEIGHT + ROW_GAP;
  for (const hint of hints) {
    const nameColor = hint.isCritical ? NAME_CRITICAL_COLOR : NAME_COLOR;
    const nameText = hint.isCritical ? `${hint.enemyName} [!]` : hint.enemyName;

    renderer.drawText(nameText, PANEL_X + PANEL_PADDING, rowY, {
      color: nameColor,
      font: 'bold 12px sans-serif',
    });
    rowY += NAME_LINE_HEIGHT;

    renderer.drawText(
      `Counters: ${hint.counters.join(', ')}`,
      PANEL_X + PANEL_PADDING + 8,
      rowY,
      { color: COUNTER_COLOR, font: '11px sans-serif' },
    );
    rowY += COUNTER_LINE_HEIGHT;

    if (hint.isCritical && hint.warningText) {
      renderer.drawText(
        hint.warningText,
        PANEL_X + PANEL_PADDING + 8,
        rowY,
        { color: WARNING_COLOR, font: 'bold 11px sans-serif' },
      );
      rowY += WARNING_LINE_HEIGHT;
    }

    rowY += ROW_GAP;
  }
}

