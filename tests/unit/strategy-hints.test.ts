import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { analyzeWave, type PlacedTowerInfo } from '../../src/game/strategy-hints';
import type { TowerData, EnemyData, WaveTable } from '../../src/logic/types';

// ── Load game data from JSON files ────────────────────────────────

const DATA_DIR = path.resolve(__dirname, '../../public/data');

function loadTowerArchetypes(): TowerData[] {
  const files = ['gatling', 'cannon', 'frost', 'poison', 'sniper', 'aura', 'economy'];
  return files.map((name) => {
    const raw = fs.readFileSync(path.join(DATA_DIR, 'archetypes', `tower_${name}.json`), 'utf-8');
    return JSON.parse(raw) as TowerData;
  });
}

function loadEnemyArchetypes(): Record<string, EnemyData> {
  const files = ['grunt', 'runner', 'armored', 'flyer', 'swarm', 'boss'];
  const map: Record<string, EnemyData> = {};
  for (const name of files) {
    const raw = fs.readFileSync(path.join(DATA_DIR, 'archetypes', `enemy_${name}.json`), 'utf-8');
    const data = JSON.parse(raw) as EnemyData;
    map[data.id] = data;
  }
  return map;
}

function loadWaveTable(): WaveTable {
  const raw = fs.readFileSync(path.join(DATA_DIR, 'waves', 'wave_table.json'), 'utf-8');
  return JSON.parse(raw) as WaveTable;
}

let towerArchetypes: TowerData[];
let enemyArchetypes: Record<string, EnemyData>;
let waveTable: WaveTable;

beforeAll(() => {
  towerArchetypes = loadTowerArchetypes();
  enemyArchetypes = loadEnemyArchetypes();
  waveTable = loadWaveTable();
});

const NO_TOWERS: PlacedTowerInfo[] = [];
const ANTI_AIR_TOWER: PlacedTowerInfo[] = [{ hitsAir: true, armorPiercing: false }];
const ARMOR_PIERCING_TOWER: PlacedTowerInfo[] = [{ hitsAir: false, armorPiercing: true }];
const BOTH_CAPABILITIES: PlacedTowerInfo[] = [{ hitsAir: true, armorPiercing: true }];

// ── Counter-tower recommendation tests ───────────────────────────

describe('Counter-tower recommendations', () => {
  test('flyer recommends towers with hitsAir', () => {
    const result = analyzeWave(6, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    const flyerHint = result!.hints.find((h) => h.enemyId === 'enemy_flyer');
    expect(flyerHint).toBeDefined();
    // Cannon and Sniper both have hitsAir=true
    expect(flyerHint!.counters).toContain('Cannon Tower');
    expect(flyerHint!.counters).toContain('Sniper Tower');
    // Gatling and Frost do NOT have hitsAir
    expect(flyerHint!.counters).not.toContain('Gatling Tower');
    expect(flyerHint!.counters).not.toContain('Frost Tower');
  });

  test('armored recommends towers with armorPiercing', () => {
    const result = analyzeWave(8, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    const armoredHint = result!.hints.find((h) => h.enemyId === 'enemy_armored');
    expect(armoredHint).toBeDefined();
    // Sniper and Poison both have armorPiercing=true
    expect(armoredHint!.counters).toContain('Sniper Tower');
    expect(armoredHint!.counters).toContain('Poison Tower');
    // Gatling does NOT have armorPiercing
    expect(armoredHint!.counters).not.toContain('Gatling Tower');
  });

  test('swarm recommends splash and rapid-fire towers', () => {
    const result = analyzeWave(11, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    const swarmHint = result!.hints.find((h) => h.enemyId === 'enemy_swarm');
    expect(swarmHint).toBeDefined();
    // Cannon has splashRadius, Gatling is rapid fire
    expect(swarmHint!.counters).toContain('Cannon Tower');
    expect(swarmHint!.counters).toContain('Gatling Tower');
  });

  test('runner recommends slow and rapid-fire towers', () => {
    const result = analyzeWave(2, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    const runnerHint = result!.hints.find((h) => h.enemyId === 'enemy_runner');
    expect(runnerHint).toBeDefined();
    // Frost has slowFactor, Gatling is rapid fire
    expect(runnerHint!.counters).toContain('Frost Tower');
    expect(runnerHint!.counters).toContain('Gatling Tower');
  });

  test('boss recommends burst, armor-piercing, and sustained DPS towers', () => {
    const result = analyzeWave(5, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    const bossHint = result!.hints.find((h) => h.enemyId === 'enemy_boss');
    expect(bossHint).toBeDefined();
    // Sniper (armorPiercing), Poison (armorPiercing), Gatling (sustained DPS)
    expect(bossHint!.counters).toContain('Sniper Tower');
    expect(bossHint!.counters).toContain('Poison Tower');
    expect(bossHint!.counters).toContain('Gatling Tower');
  });

  test('grunt recommends any combat tower', () => {
    const result = analyzeWave(1, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    const gruntHint = result!.hints.find((h) => h.enemyId === 'enemy_grunt');
    expect(gruntHint).toBeDefined();
    expect(gruntHint!.counters).toEqual(['Any combat tower']);
  });
});

// ── Critical warning tests ───────────────────────────────────────

describe('Critical warnings', () => {
  test('flyer is critical when no anti-air towers are placed', () => {
    const result = analyzeWave(6, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    const flyerHint = result!.hints.find((h) => h.enemyId === 'enemy_flyer');
    expect(flyerHint).toBeDefined();
    expect(flyerHint!.isCritical).toBe(true);
    expect(flyerHint!.warningText).toContain('anti-air');
  });

  test('flyer is NOT critical when anti-air tower is placed', () => {
    const result = analyzeWave(6, waveTable, enemyArchetypes, towerArchetypes, ANTI_AIR_TOWER);
    expect(result).not.toBeNull();
    const flyerHint = result!.hints.find((h) => h.enemyId === 'enemy_flyer');
    expect(flyerHint).toBeDefined();
    expect(flyerHint!.isCritical).toBe(false);
    expect(flyerHint!.warningText).toBeNull();
  });

  test('armored is critical when no armor-piercing towers are placed', () => {
    const result = analyzeWave(8, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    const armoredHint = result!.hints.find((h) => h.enemyId === 'enemy_armored');
    expect(armoredHint).toBeDefined();
    expect(armoredHint!.isCritical).toBe(true);
    expect(armoredHint!.warningText).toContain('armor-piercing');
  });

  test('armored is NOT critical when armor-piercing tower is placed', () => {
    const result = analyzeWave(8, waveTable, enemyArchetypes, towerArchetypes, ARMOR_PIERCING_TOWER);
    expect(result).not.toBeNull();
    const armoredHint = result!.hints.find((h) => h.enemyId === 'enemy_armored');
    expect(armoredHint).toBeDefined();
    expect(armoredHint!.isCritical).toBe(false);
    expect(armoredHint!.warningText).toBeNull();
  });

  test('boss is always critical regardless of placed towers', () => {
    const result = analyzeWave(5, waveTable, enemyArchetypes, towerArchetypes, BOTH_CAPABILITIES);
    expect(result).not.toBeNull();
    const bossHint = result!.hints.find((h) => h.enemyId === 'enemy_boss');
    expect(bossHint).toBeDefined();
    expect(bossHint!.isCritical).toBe(true);
    expect(bossHint!.warningText).toContain('Boss');
  });

  test('grunt is never critical', () => {
    const result = analyzeWave(1, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    const gruntHint = result!.hints.find((h) => h.enemyId === 'enemy_grunt');
    expect(gruntHint).toBeDefined();
    expect(gruntHint!.isCritical).toBe(false);
    expect(gruntHint!.warningText).toBeNull();
  });

  test('runner is never critical', () => {
    const result = analyzeWave(2, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    const runnerHint = result!.hints.find((h) => h.enemyId === 'enemy_runner');
    expect(runnerHint).toBeDefined();
    expect(runnerHint!.isCritical).toBe(false);
  });

  test('swarm is never critical', () => {
    const result = analyzeWave(11, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    const swarmHint = result!.hints.find((h) => h.enemyId === 'enemy_swarm');
    expect(swarmHint).toBeDefined();
    expect(swarmHint!.isCritical).toBe(false);
  });

  test('hasCritical is true when any hint is critical', () => {
    const result = analyzeWave(6, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    expect(result!.hasCritical).toBe(true);
  });

  test('hasCritical is false when no hints are critical', () => {
    const result = analyzeWave(1, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    expect(result!.hasCritical).toBe(false);
  });
});

// ── Multi-enemy wave tests ───────────────────────────────────────

describe('Multi-enemy waves', () => {
  test('wave 6 has both grunt and flyer hints', () => {
    const result = analyzeWave(6, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    expect(result!.hints).toHaveLength(2);
    const ids = result!.hints.map((h) => h.enemyId);
    expect(ids).toContain('enemy_grunt');
    expect(ids).toContain('enemy_flyer');
  });

  test('wave 20 has boss, flyer, and armored hints', () => {
    const result = analyzeWave(20, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    expect(result!.hints).toHaveLength(3);
    const ids = result!.hints.map((h) => h.enemyId);
    expect(ids).toContain('enemy_boss');
    expect(ids).toContain('enemy_flyer');
    expect(ids).toContain('enemy_armored');
  });

  test('wave 30 has 4 enemy types', () => {
    const result = analyzeWave(30, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    expect(result!.hints).toHaveLength(4);
  });

  test('critical warning clears for flyer when anti-air built during prep', () => {
    // Simulate: first check with no towers (critical), then with anti-air (not critical)
    const before = analyzeWave(6, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    const flyerBefore = before!.hints.find((h) => h.enemyId === 'enemy_flyer');
    expect(flyerBefore!.isCritical).toBe(true);

    const after = analyzeWave(6, waveTable, enemyArchetypes, towerArchetypes, ANTI_AIR_TOWER);
    const flyerAfter = after!.hints.find((h) => h.enemyId === 'enemy_flyer');
    expect(flyerAfter!.isCritical).toBe(false);
  });

  test('critical warning clears for armored when armor-piercing built during prep', () => {
    const before = analyzeWave(8, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    const armoredBefore = before!.hints.find((h) => h.enemyId === 'enemy_armored');
    expect(armoredBefore!.isCritical).toBe(true);

    const after = analyzeWave(8, waveTable, enemyArchetypes, towerArchetypes, ARMOR_PIERCING_TOWER);
    const armoredAfter = after!.hints.find((h) => h.enemyId === 'enemy_armored');
    expect(armoredAfter!.isCritical).toBe(false);
  });
});

// ── Edge cases ───────────────────────────────────────────────────

describe('Edge cases', () => {
  test('returns null for wave number not in table', () => {
    const result = analyzeWave(999, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).toBeNull();
  });

  test('returns null for wave 0', () => {
    const result = analyzeWave(0, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).toBeNull();
  });

  test('enemy names come from presentation data', () => {
    const result = analyzeWave(1, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    const gruntHint = result!.hints[0];
    expect(gruntHint.enemyName).toBe('Grunt');
  });

  test('hint includes enemyId for lookups', () => {
    const result = analyzeWave(1, waveTable, enemyArchetypes, towerArchetypes, NO_TOWERS);
    expect(result).not.toBeNull();
    expect(result!.hints[0].enemyId).toBe('enemy_grunt');
  });
});

