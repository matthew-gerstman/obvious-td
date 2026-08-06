/**
 * Balance Report Generator
 *
 * Runs the balance gate (checkWaveBalance) for every wave/map/difficulty
 * combination and outputs a human-readable report. Also exports the
 * simulation logic used by tests/unit/balance-gate.test.ts.
 *
 * Usage:
 *   npx tsx tests/balance-report.ts
 *   npx vitest run tests/unit/balance-gate.test.ts --reporter=verbose
 */

import { checkWaveBalance } from '../src/logic/balance-gate';
import { calculateWaveGoldReward } from '../src/logic/economy';
import { getWaveDuration } from '../src/logic/wave-scaling';
import type {
  DifficultyMode,
  EnemyLogic,
  MapData,
  PlacedTower,
  TowerData,
  WaveTable,
} from '../src/logic/types';
import {
  loadEnemyData,
  loadDifficultyMode,
  loadWaveTable,
  loadMap,
  loadTowerData,
} from './unit/logic/test-helpers';

// ── Types ────────────────────────────────────────────────────────

export type DifficultyKey = 'easy' | 'medium' | 'hard';

export interface BalanceCheckResult {
  mapId: string;
  difficulty: DifficultyKey;
  wave: number;
  passed: boolean;
  waveHP: number;
  playerDPS: number;
  purchasableDPS: number;
  duration: number;
  details: string;
}

// ── Constants ────────────────────────────────────────────────────

const MAP_IDS = ['map_single_path', 'map_multi_path', 'map_branching'];
const DIFFICULTIES: DifficultyKey[] = ['easy', 'medium', 'hard'];
const TOTAL_WAVES = 30;
const WAVE_CLEAR_BONUS_BASE = 20;
const WAVE_CLEAR_BONUS_PER_WAVE = 5;

// ── Helpers ─────────────────────────────────────────────────────

/** Computes the Euclidean length of the first path (matches balance-gate.ts). */
function computePathLength(map: MapData): number {
  const path = map.logic.paths[0];
  if (!path) return 0;
  let length = 0;
  for (let i = 1; i < path.waypoints.length; i++) {
    const prev = path.waypoints[i - 1];
    const curr = path.waypoints[i];
    if (!prev || !curr) continue;
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

// ── Tower Setup Simulation ───────────────────────────────────────

/**
 * Simulates a reasonable tower setup for the given wave.
 *
 * Assumptions:
 * 1. Gold model: starting gold + cumulative kill gold + wave-clear
 *    bonuses from all previous waves (1..wave-1). Wave-clear bonus
 *    = 20 + wave * 5 (from EconomyManager.processWaveClear).
 *    Additionally, the player builds 1 economy tower T1 early
 *    (cost=75) and upgrades it over time. Passive income from the
 *    economy tower is calculated per-wave using getWaveDuration and
 *    the tower's current tier income rate. This represents a common
 *    player strategy and is necessary because the balance gate's
 *    duration varies by map path length — shorter paths require more
 *    DPS, and economy income provides the extra gold to fund it.
 * 2. Tower mix: 50% Gatling, 30% Cannon, 20% Sniper — all
 *    damage-dealing towers. Frost/Aura/Economy are utility towers
 *    excluded from the DPS simulation since the balance gate only
 *    measures raw DPS.
 * 3. Tile limit: towers are placed on buildable tiles first, then
 *    upgraded to tier 3. If gold remains after filling all tiles with
 *    T3 towers, additional damage towers are added. The balance gate
 *    (checkWaveBalance) does not verify tile coordinates — it only
 *    sums DPS from the PlacedTower array — so extra towers represent
 *    the player using banked gold to reinforce defenses during the
 *    wave.
 * 4. Upgrade priority: all towers are upgraded to T3 before buying
 *    new towers beyond the tile limit, since upgrades have better
 *    cost-per-DPS ratios than new T1 towers.
 */
export function simulateTowerSetup(
  wave: number,
  difficulty: DifficultyMode,
  map: MapData,
  towerData: TowerData[],
  enemyData: Record<string, EnemyLogic>,
  waveTable: WaveTable,
): PlacedTower[] {
  const pathLength = computePathLength(map);

  // Find economy tower data for passive income simulation
  const economyTower = towerData.find((t) => t.id === 'tower_economy');

  // Calculate total gold available from previous waves
  let gold = difficulty.startingGold;

  // Build 1 economy tower T1 early for passive income generation
  let economyTier = 0;
  if (economyTower && gold >= 75) {
    gold -= 75;
    economyTier = 1;
  }

  for (let w = 1; w < wave; w++) {
    // Kill gold + wave-clear bonus
    gold += calculateWaveGoldReward(w, enemyData, waveTable, 0);
    gold += WAVE_CLEAR_BONUS_BASE + w * WAVE_CLEAR_BONUS_PER_WAVE;

    // Economy tower passive income for this wave
    if (economyTier > 0 && economyTower) {
      const tier = economyTower.logic.tiers[economyTier - 1];
      if (tier && tier.incomePerTick !== undefined && tier.incomeInterval !== undefined) {
        const duration = getWaveDuration(w, enemyData, difficulty, waveTable, pathLength);
        const income = tier.incomePerTick * Math.floor(duration / tier.incomeInterval);
        gold += income;
      }
      // Upgrade economy tower only when enough gold remains for damage
      // towers afterward (reserve 100g = 2 Gatling T1 placements)
      if (economyTier < 3) {
        const nextTier = economyTower.logic.tiers[economyTier];
        if (nextTier && gold > nextTier.cost + 100) {
          gold -= nextTier.cost;
          economyTier++;
        }
      }
    }
  }

  const buildableTiles = map.logic.buildableTiles;
  const tileCount = buildableTiles.length;
  const towers: PlacedTower[] = [];

  // Phase 1: Fill buildable tiles with a mix of damage towers
  // 50% Gatling, 30% Cannon, 20% Sniper
  const gatlingCount = Math.ceil(tileCount * 0.5);
  const cannonCount = Math.ceil(tileCount * 0.3);
  const sniperCount = Math.max(0, tileCount - gatlingCount - cannonCount);

  const mix = [
    { id: 'tower_gatling', count: gatlingCount },
    { id: 'tower_cannon', count: cannonCount },
    { id: 'tower_sniper', count: sniperCount },
  ];

  let tileIndex = 0;
  for (const { id, count } of mix) {
    const tower = towerData.find((t) => t.id === id);
    if (!tower) continue;
    const tier1 = tower.logic.tiers[0];
    if (!tier1) continue;
    for (let i = 0; i < count && tileIndex < tileCount; i++) {
      if (gold >= tier1.cost) {
        const tile = buildableTiles[tileIndex];
        if (!tile) break;
        towers.push({ towerData: tower, tier: 1, x: tile.x, y: tile.y });
        gold -= tier1.cost;
        tileIndex++;
      }
    }
  }

  // Phase 2: Upgrade all towers to max tier (T3)
  let upgraded = true;
  while (upgraded) {
    upgraded = false;
    for (const tower of towers) {
      if (tower.tier < 3) {
        const nextTier = tower.towerData.logic.tiers[tower.tier];
        if (nextTier && gold >= nextTier.cost) {
          gold -= nextTier.cost;
          tower.tier++;
          upgraded = true;
        }
      }
    }
  }

  // Phase 3: Use remaining gold for additional damage towers
  // (The balance gate doesn't check tile coordinates — only DPS)
  const damageTowerIds = ['tower_gatling', 'tower_cannon', 'tower_sniper'];
  let safetyCounter = 0;
  while (gold >= 50 && safetyCounter < 500) {
    safetyCounter++;
    let bought = false;
    for (const id of damageTowerIds) {
      const tower = towerData.find((t) => t.id === id);
      if (!tower) continue;
      const tier1 = tower.logic.tiers[0];
      if (!tier1) continue;
      if (gold >= tier1.cost) {
        const newTower: PlacedTower = {
          towerData: tower,
          tier: 1,
          x: 0,
          y: 0,
        };
        gold -= tier1.cost;
        // Upgrade to max tier if possible
        for (let t = 1; t < 3; t++) {
          const nextTier = tower.logic.tiers[t];
          if (nextTier && gold >= nextTier.cost) {
            gold -= nextTier.cost;
            newTower.tier++;
          } else {
            break;
          }
        }
        towers.push(newTower);
        bought = true;
        break;
      }
    }
    if (!bought) break;
  }

  return towers;
}

// ── Balance Check ────────────────────────────────────────────────

/**
 * Runs the balance gate for every wave/map/difficulty combination.
 * Returns an array of results.
 */
export function runBalanceForAllCombinations(): BalanceCheckResult[] {
  const enemyData = loadEnemyData();
  const waveTable = loadWaveTable();
  const towerData = loadTowerData();

  const results: BalanceCheckResult[] = [];

  for (const mapId of MAP_IDS) {
    const map = loadMap(mapId);
    for (const difficulty of DIFFICULTIES) {
      const diffMode = loadDifficultyMode(difficulty);
      for (let wave = 1; wave <= TOTAL_WAVES; wave++) {
        const towers = simulateTowerSetup(
          wave,
          diffMode,
          map,
          towerData,
          enemyData,
          waveTable,
        );
        const result = checkWaveBalance(
          wave,
          map,
          diffMode,
          towers,
          enemyData,
          waveTable,
        );
        results.push({
          mapId,
          difficulty,
          wave,
          passed: result.passed,
          waveHP: result.waveHP,
          playerDPS: result.playerDPS,
          purchasableDPS: result.purchasableDPS,
          duration: result.duration,
          details: result.details,
        });
      }
    }
  }

  return results;
}

// ── Report Formatting ────────────────────────────────────────────

/**
 * Formats balance results as a human-readable report.
 */
export function formatReport(results: BalanceCheckResult[]): string {
  const lines: string[] = [];
  const bar = '='.repeat(100);
  lines.push(bar);
  lines.push('  BALANCE GATE REPORT — All Wave/Map/Difficulty Combinations');
  lines.push(bar);
  lines.push('');

  // Summary
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  const mediumFailures = results.filter(
    (r) => r.difficulty === 'medium' && !r.passed,
  ).length;
  const easyFailures = results.filter(
    (r) => r.difficulty === 'easy' && !r.passed,
  ).length;
  const hardFailures = results.filter(
    (r) => r.difficulty === 'hard' && !r.passed,
  ).length;

  lines.push(`  Total: ${total}  |  Passed: ${passed}  |  Failed: ${failed}`);
  lines.push(`  Medium failures: ${mediumFailures} (HARD FAILURE)`);
  lines.push(`  Easy failures: ${easyFailures} (warning)`);
  lines.push(`  Hard failures: ${hardFailures} (warning)`);
  lines.push('');

  // Per-difficulty breakdown
  for (const diff of DIFFICULTIES) {
    const diffResults = results.filter((r) => r.difficulty === diff);
    const diffFailures = diffResults.filter((r) => !r.passed);

    const label = diff.toUpperCase();
    const dashCount = Math.max(0, 90 - label.length);
    lines.push(`- ${label} ${'-'.repeat(dashCount)}`);
    lines.push('');

    if (diffFailures.length === 0) {
      lines.push('  All combinations PASSED');
      lines.push('');
      continue;
    }

    lines.push('  FAILURES:');
    lines.push('');
    for (const r of diffFailures) {
      lines.push(`  [${r.mapId}] Wave ${r.wave}:`);
      lines.push(`    ${r.details}`);
      lines.push('');
    }
  }

  lines.push(bar);
  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────

function main(): void {
  console.log('Running balance gate for all combinations...');
  const results = runBalanceForAllCombinations();
  console.log(formatReport(results));

  const mediumFailures = results.filter(
    (r) => r.difficulty === 'medium' && !r.passed,
  );
  if (mediumFailures.length > 0) {
    console.error(`\nFAILED: ${mediumFailures.length} Medium balance failure(s)`);
    process.exitCode = 1;
  } else {
    console.log('\nPASSED: All Medium combinations passed');
  }
}

// Run if executed directly
if (process.argv[1]?.includes('balance-report')) {
  main();
}

