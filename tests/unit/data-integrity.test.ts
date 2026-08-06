import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA_ARCHETYPES_DIR = 'public/data/archetypes';
const DATA_MAPS_DIR = 'public/data/maps';
const DATA_WAVES_DIR = 'public/data/waves';

function loadJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

interface TowerTier {
  tier: number;
  cost: number;
  damage: number;
  cooldown: number;
  range: number;
  targeting: string;
  hitsAir: boolean;
  armorPiercing: boolean;
}

interface TowerData {
  id: string;
  archetype: string;
  logic: { tiers: TowerTier[] };
}

interface EnemyData {
  id: string;
  archetype: string;
  logic: {
    baseHP: number;
    speed: number;
    flying: boolean;
    goldReward: number;
    isBoss: boolean;
  };
}

interface MapData {
  id: string;
  logic: {
    width: number;
    height: number;
    paths: Array<{ id: string; waypoints: Array<{ x: number; y: number }> }>;
    buildableTiles: Array<{ x: number; y: number }>;
  };
}

interface WaveTableData {
  waves: Array<{
    wave: number;
    enemies: Array<{ enemyId: string; count: number; interval: number }>;
  }>;
}

function loadTowers(): TowerData[] {
  return readdirSync(DATA_ARCHETYPES_DIR)
    .filter(file => file.startsWith('tower_') && file.endsWith('.json'))
    .map(file => loadJson(join(DATA_ARCHETYPES_DIR, file)) as TowerData);
}

function loadEnemies(): EnemyData[] {
  return readdirSync(DATA_ARCHETYPES_DIR)
    .filter(file => file.startsWith('enemy_') && file.endsWith('.json'))
    .map(file => loadJson(join(DATA_ARCHETYPES_DIR, file)) as EnemyData);
}

function loadMaps(): MapData[] {
  return readdirSync(DATA_MAPS_DIR)
    .filter(file => file.startsWith('map_') && file.endsWith('.json'))
    .map(file => loadJson(join(DATA_MAPS_DIR, file)) as MapData);
}

function isGapFree(waypoints: Array<{ x: number; y: number }>): boolean {
  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    if (!prev || !curr) return false;
    const dx = Math.abs(curr.x - prev.x);
    const dy = Math.abs(curr.y - prev.y);
    if (dx + dy !== 1) return false;
  }
  return true;
}

describe('Data integrity — towers', () => {
  const expectedArchetypes = ['aura', 'cannon', 'economy', 'frost', 'gatling', 'poison', 'sniper'];

  it('all 7 towers present with correct archetypes', () => {
    const towers = loadTowers();
    expect(towers).toHaveLength(7);
    const archetypes = towers.map(t => t.archetype).sort();
    expect(archetypes).toEqual(expectedArchetypes);
  });

  it('each tower has valid 3-tier structure', () => {
    const towers = loadTowers();
    for (const tower of towers) {
      expect(tower.logic.tiers).toHaveLength(3);
      expect(tower.logic.tiers[0]?.tier).toBe(1);
      expect(tower.logic.tiers[1]?.tier).toBe(2);
      expect(tower.logic.tiers[2]?.tier).toBe(3);
      for (const tier of tower.logic.tiers) {
        expect(tier.cost).toBeGreaterThan(0);
        expect(tier.damage).toBeGreaterThanOrEqual(0);
        expect(tier.cooldown).toBeGreaterThanOrEqual(0);
        expect(tier.range).toBeGreaterThanOrEqual(0);
        expect(['first', 'last', 'strong', 'close', 'none']).toContain(tier.targeting);
      }
    }
  });
});

describe('Data integrity — enemies', () => {
  const expectedArchetypes = ['armored', 'boss', 'flyer', 'grunt', 'runner', 'swarm'];

  it('all 6 enemies present with correct archetypes', () => {
    const enemies = loadEnemies();
    expect(enemies).toHaveLength(6);
    const archetypes = enemies.map(e => e.archetype).sort();
    expect(archetypes).toEqual(expectedArchetypes);
  });

  it('each enemy has correct archetype fields', () => {
    const enemies = loadEnemies();
    for (const enemy of enemies) {
      expect(enemy.logic.baseHP).toBeGreaterThan(0);
      expect(enemy.logic.speed).toBeGreaterThanOrEqual(0);
      expect(typeof enemy.logic.flying).toBe('boolean');
      expect(enemy.logic.goldReward).toBeGreaterThanOrEqual(0);
      expect(typeof enemy.logic.isBoss).toBe('boolean');
    }
    const boss = enemies.find(e => e.archetype === 'boss');
    expect(boss?.logic.isBoss).toBe(true);
    const nonBosses = enemies.filter(e => e.archetype !== 'boss');
    for (const enemy of nonBosses) {
      expect(enemy.logic.isBoss).toBe(false);
    }
  });
});

describe('Data integrity — maps', () => {
  it('all 3 maps present', () => {
    const maps = loadMaps();
    expect(maps).toHaveLength(3);
  });

  it('all paths are gap-free (adjacent waypoints differ by exactly 1)', () => {
    const maps = loadMaps();
    for (const map of maps) {
      for (const path of map.logic.paths) {
        expect(isGapFree(path.waypoints)).toBe(true);
      }
    }
  });

  it('no buildable tile overlaps with a path tile', () => {
    const maps = loadMaps();
    for (const map of maps) {
      const pathTiles = new Set<string>();
      for (const path of map.logic.paths) {
        for (const wp of path.waypoints) {
          pathTiles.add(`${wp.x},${wp.y}`);
        }
      }
      for (const tile of map.logic.buildableTiles) {
        expect(pathTiles.has(`${tile.x},${tile.y}`)).toBe(false);
      }
    }
  });
});

describe('Data integrity — wave table', () => {
  it('has exactly 30 waves', () => {
    const waveTable = loadJson(join(DATA_WAVES_DIR, 'wave_table.json')) as WaveTableData;
    expect(waveTable.waves).toHaveLength(30);
  });

  it('has boss waves at 5, 10, 15, 20, 25, 30', () => {
    const waveTable = loadJson(join(DATA_WAVES_DIR, 'wave_table.json')) as WaveTableData;
    const bossWaves = waveTable.waves
      .filter(w => w.enemies.some(e => e.enemyId === 'enemy_boss'))
      .map(w => w.wave);
    expect(bossWaves).toEqual([5, 10, 15, 20, 25, 30]);
  });
});
