import { describe, it, expect } from 'vitest';
import { checkWaveBalance } from '../../../src/logic/balance-gate';
import type { PlacedTower } from '../../../src/logic/types';
import {
  loadEnemyData,
  loadDifficultyMode,
  loadWaveTable,
  loadMap,
  loadTowerData,
} from './test-helpers';

describe('Balance gate', () => {
  const enemyData = loadEnemyData();
  const medium = loadDifficultyMode('medium');
  const waveTable = loadWaveTable();
  const map = loadMap('map_single_path');
  const towers = loadTowerData();

  function makePlacedTower(towerId: string, tier: number, x = 5, y = 5): PlacedTower {
    const tower = towers.find((t) => t.id === towerId);
    if (!tower) throw new Error(`Tower ${towerId} not found`);
    return { towerData: tower, tier, x, y };
  }

  it('passes when player DPS exceeds wave HP', () => {
    // Wave 1: 5 grunts, total HP = 300 (medium)
    // Place 4 tier-3 gatling towers (DPS = 15/0.2 = 75 each, total = 300)
    const placedTowers = [
      makePlacedTower('tower_gatling', 3, 5, 5),
      makePlacedTower('tower_gatling', 3, 7, 9),
      makePlacedTower('tower_gatling', 3, 12, 5),
      makePlacedTower('tower_gatling', 3, 17, 9),
    ];
    const result = checkWaveBalance(1, map, medium, placedTowers, enemyData, waveTable);
    expect(result.passed).toBe(true);
    expect(result.waveHP).toBeCloseTo(300, 1);
    expect(result.playerDPS).toBeGreaterThan(0);
  });

  it('fails when wave HP far exceeds player DPS', () => {
    // Wave 30: boss + many enemies, very high HP
    // Place a single tier-1 gatling tower (DPS = 5/0.3 = 16.67)
    const placedTowers = [
      makePlacedTower('tower_gatling', 1, 5, 5),
    ];
    const result = checkWaveBalance(30, map, medium, placedTowers, enemyData, waveTable);
    expect(result.passed).toBe(false);
    expect(result.waveHP).toBeGreaterThan(0);
  });

  it('returns all required fields', () => {
    const placedTowers = [makePlacedTower('tower_gatling', 1, 5, 5)];
    const result = checkWaveBalance(1, map, medium, placedTowers, enemyData, waveTable);
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('waveHP');
    expect(result).toHaveProperty('playerDPS');
    expect(result).toHaveProperty('purchasableDPS');
    expect(result).toHaveProperty('duration');
    expect(result).toHaveProperty('details');
    expect(typeof result.details).toBe('string');
    expect(result.details).toContain('Wave 1');
  });

  it('excludes non-damage towers from DPS calculation', () => {
    // Aura and economy towers have 0 damage
    const placedTowers = [
      makePlacedTower('tower_aura', 1, 5, 5),
      makePlacedTower('tower_economy', 1, 7, 9),
    ];
    const result = checkWaveBalance(1, map, medium, placedTowers, enemyData, waveTable);
    expect(result.playerDPS).toBe(0);
    expect(result.passed).toBe(false);
  });
});

