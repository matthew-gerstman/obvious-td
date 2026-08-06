import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Enemy } from '../../src/enemies/enemy';
import { WaveRunner } from '../../src/waves/wave-runner';
import { BossTelegraph } from '../../src/waves/boss-telegraph';
import { Path } from '../../src/maps/path';
import { loadMap as parseMap } from '../../src/maps/map-loader';
import { loadDifficultyMode, loadWaveTable } from './logic/test-helpers';
import type { EnemyData, WaveTable } from '../../src/logic/types';

function loadJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function loadFullEnemyData(): Record<string, EnemyData> {
  const dir = 'public/data/archetypes';
  const files = readdirSync(dir).filter(
    (f) => f.startsWith('enemy_') && f.endsWith('.json'),
  );
  const result: Record<string, EnemyData> = {};
  for (const file of files) {
    const data = loadJson(join(dir, file)) as EnemyData;
    result[data.id] = data;
  }
  return result;
}

function loadGameMap(mapId: string) {
  const data = loadJson(`public/data/maps/${mapId}.json`);
  return parseMap(data as object);
}

/** Compute the expected total spawn count for a wave from the wave table. */
function expectedSpawnCount(
  waveTable: WaveTable,
  waveNumber: number,
  enemyData: Record<string, EnemyData>,
): number {
  const wave = waveTable.waves.find((w) => w.wave === waveNumber);
  if (!wave) return 0;
  let total = 0;
  for (const entry of wave.enemies) {
    const data = enemyData[entry.enemyId];
    if (!data) continue;
    const multiplier = data.logic.spawnCount ?? 1;
    total += entry.count * multiplier;
  }
  return total;
}

/** Build a straight horizontal path of the given length. */
function straightPath(length: number): Path {
  const waypoints = [];
  for (let i = 0; i <= length; i++) {
    waypoints.push({ x: i, y: 0 });
  }
  return new Path('test', waypoints);
}

const DT = 1 / 60;

describe('WI-6: Enemy + Wave Orchestration', () => {
  const enemyData = loadFullEnemyData();
  const waveTable = loadWaveTable();
  const easy = loadDifficultyMode('easy');
  const medium = loadDifficultyMode('medium');
  const hard = loadDifficultyMode('hard');

  describe('Wave spawn count', () => {
    it('wave 1 spawns exactly 5 grunts', () => {
      const map = loadGameMap('map_single_path');
      const runner = new WaveRunner();
      runner.startWave(1, waveTable, enemyData, medium, map);

      // Wave 1: 5 grunts, interval 1s. Last spawns at t=4.
      // Use dt=5.0 so one update spawns all enemies.
      runner.update(5.0, map);

      expect(runner.getSpawnedCount()).toBe(5);
      expect(runner.getSpawnedCount()).toBe(
        expectedSpawnCount(waveTable, 1, enemyData),
      );
    });

    it('wave 11 spawns exactly 24 swarm (3 groups x spawnCount 8)', () => {
      const map = loadGameMap('map_single_path');
      const runner = new WaveRunner();
      runner.startWave(11, waveTable, enemyData, medium, map);

      // 24 enemies, interval 1.5s. Last spawns at t=34.5.
      runner.update(35.0, map);

      expect(runner.getSpawnedCount()).toBe(24);
      expect(runner.getSpawnedCount()).toBe(
        expectedSpawnCount(waveTable, 11, enemyData),
      );
    });

    it('wave 3 spawns 6 grunts + 4 runners = 10 total', () => {
      const map = loadGameMap('map_single_path');
      const runner = new WaveRunner();
      runner.startWave(3, waveTable, enemyData, medium, map);

      // Group 1: 6 grunts, interval 0.9, spawnTime 0..4.5
      // Group 2: 4 runners, interval 0.8, spawnTime 5.4..7.8
      runner.update(8.0, map);

      expect(runner.getSpawnedCount()).toBe(10);
      expect(runner.getSpawnedCount()).toBe(
        expectedSpawnCount(waveTable, 3, enemyData),
      );
    });
  });

  describe('Enemy path traversal', () => {
    it('reaches pathProgress 1.0 at the expected tick window', () => {
      // Path length 10, speed 1.0, dt = 1/60.
      // Expected ticks = 10 / (1.0 * 1/60) = 600.
      const path = straightPath(10);
      const gruntData = enemyData['enemy_grunt']!;

      const enemy = new Enemy(gruntData, 1, easy, 'test');

      // 599 ticks — enemy should still be alive
      for (let i = 0; i < 599; i++) {
        enemy.update(DT, path);
      }
      expect(enemy.status).toBe('alive');
      expect(enemy.pathProgress).toBeLessThan(1.0);

      // 2 more ticks (601 total) — enemy should have leaked
      enemy.update(DT, path);
      enemy.update(DT, path);
      expect(enemy.status).toBe('leaked');
      expect(enemy.pathProgress).toBe(1.0);
    });
  });

  describe('Boss telegraph', () => {
    it('shouldTelegraph(4, 5) returns true — wave 5 is a boss wave', () => {
      const telegraph = new BossTelegraph();
      expect(telegraph.shouldTelegraph(4, 5)).toBe(true);
    });

    it('shouldTelegraph(3, 4) returns false — wave 4 is not a boss wave', () => {
      const telegraph = new BossTelegraph();
      expect(telegraph.shouldTelegraph(3, 4)).toBe(false);
    });

    it('markShown prevents repeat telegraph for the same wave', () => {
      const telegraph = new BossTelegraph();
      expect(telegraph.shouldTelegraph(4, 5)).toBe(true);
      telegraph.markShown(5);
      expect(telegraph.shouldTelegraph(4, 5)).toBe(false);
    });

    it('getTelegraphMessage includes the wave number', () => {
      const telegraph = new BossTelegraph();
      const msg = telegraph.getTelegraphMessage(10);
      expect(msg).toContain('10');
      expect(msg).toContain('BOSS');
    });

    it('WaveRunner sets boss telegraph flag for boss waves', () => {
      const map = loadGameMap('map_single_path');
      const runner = new WaveRunner();
      runner.startWave(5, waveTable, enemyData, medium, map);
      expect(runner.isBossTelegraphActive()).toBe(true);
    });

    it('WaveRunner does not set boss telegraph flag for normal waves', () => {
      const map = loadGameMap('map_single_path');
      const runner = new WaveRunner();
      runner.startWave(1, waveTable, enemyData, medium, map);
      expect(runner.isBossTelegraphActive()).toBe(false);
    });
  });

  describe('Enemy HP scaling by difficulty', () => {
    it('grunt HP differs by difficulty multiplier at wave 1', () => {
      const gruntData = enemyData['enemy_grunt']!;
      const easyEnemy = new Enemy(gruntData, 1, easy, 'test');
      const hardEnemy = new Enemy(gruntData, 1, hard, 'test');

      // At wave 1, scaleHP returns baseHP (scalingRate^0 = 1).
      // Easy: 60 * 0.7 = 42
      // Hard: 60 * 1.5 = 90
      expect(easyEnemy.hp).toBe(42);
      expect(hardEnemy.hp).toBe(90);
      expect(hardEnemy.hp / easyEnemy.hp).toBeCloseTo(1.5 / 0.7, 5);
    });

    it('boss HP gets the boss multiplier on top of difficulty', () => {
      const bossData = enemyData['enemy_boss']!;
      const easyBoss = new Enemy(bossData, 5, easy, 'test');
      const mediumBoss = new Enemy(bossData, 5, medium, 'test');

      // scaleHP(300, 5, 1.10) = 300 * 1.10^4 = 300 * 1.4641 = 439.23
      // Easy: 439.23 * 0.7 * 4 = 1229.844
      // Medium: scaleHP(300, 5, 1.15) = 300 * 1.15^4 = 300 * 1.74900625 = 524.701875
      // Medium: 524.701875 * 1.0 * 4 = 2098.8075
      expect(easyBoss.maxHP).toBeCloseTo(300 * 1.10 ** 4 * 0.7 * 4, 2);
      expect(mediumBoss.maxHP).toBeCloseTo(300 * 1.15 ** 4 * 1.0 * 4, 2);
    });
  });

  describe('Enemy damage and armor', () => {
    it('armored enemy takes reduced damage from non-AP source', () => {
      const armoredData = enemyData['enemy_armored']!;
      // Wave 1, medium: HP = 100 * 1.0 = 100, armor = 0.5
      const enemy = new Enemy(armoredData, 1, medium, 'test');
      const initialHP = enemy.hp;

      enemy.takeDamage(50, false);
      // applyArmor(50, 0.5, false) = 50 * 0.5 = 25
      expect(enemy.hp).toBe(initialHP - 25);
    });

    it('armored enemy takes full damage from AP source', () => {
      const armoredData = enemyData['enemy_armored']!;
      const enemy = new Enemy(armoredData, 1, medium, 'test');
      const initialHP = enemy.hp;

      enemy.takeDamage(50, true);
      // applyArmor(50, 0.5, true) = 50
      expect(enemy.hp).toBe(initialHP - 50);
    });

    it('enemy dies when HP reaches zero', () => {
      const runnerData = enemyData['enemy_runner']!;
      // Wave 1, medium: HP = 30 * 1.0 = 30
      const enemy = new Enemy(runnerData, 1, medium, 'test');

      enemy.takeDamage(30, false);
      expect(enemy.hp).toBe(0);
      expect(enemy.status).toBe('dead');
    });
  });

  describe('Enemy leak', () => {
    it('enemy leaks when pathProgress reaches 1.0', () => {
      // Path length 2, speed 1.0, dt = 1.0 -> 0.5 per update.
      // 0.5 is exactly representable in float64, so 2 updates = 1.0 exactly.
      const path = straightPath(2);
      const gruntData = enemyData['enemy_grunt']!;

      const enemy = new Enemy(gruntData, 1, easy, 'test');

      // 1 update: pathProgress = 0.5, still alive
      enemy.update(1.0, path);
      expect(enemy.status).toBe('alive');

      // 2 updates: pathProgress = 1.0, leaked
      enemy.update(1.0, path);
      expect(enemy.status).toBe('leaked');
      expect(enemy.pathProgress).toBe(1.0);
    });
  });

  describe('Slow effect', () => {
    it('reduces currentSpeed and expires after duration', () => {
      const path = straightPath(10);
      const gruntData = enemyData['enemy_grunt']!;
      // Grunt speed = 1.0
      const enemy = new Enemy(gruntData, 1, easy, 'test');

      expect(enemy.currentSpeed).toBe(enemy.speed);

      // Apply 50% slow for 1 second
      enemy.applySlow(0.5, 1.0);
      expect(enemy.currentSpeed).toBe(0.5);

      // Update with dt=1.0 — slow duration drops to 0, effect expires
      enemy.update(1.0, path);
      expect(enemy.currentSpeed).toBe(enemy.speed);
    });

    it('strongest slow wins when multiple slows are active', () => {
      const gruntData = enemyData['enemy_grunt']!;
      const enemy = new Enemy(gruntData, 1, easy, 'test');

      enemy.applySlow(0.7, 5.0); // 70% speed
      expect(enemy.currentSpeed).toBeCloseTo(0.7, 5);

      enemy.applySlow(0.4, 3.0); // 40% speed — stronger
      expect(enemy.currentSpeed).toBeCloseTo(0.4, 5);
    });
  });

  describe('Wave state machine', () => {
    it('transitions idle -> spawning -> active -> complete', () => {
      const map = loadGameMap('map_single_path');
      const runner = new WaveRunner();
      expect(runner.getWaveState()).toBe('idle');

      runner.startWave(1, waveTable, enemyData, medium, map);
      expect(runner.getWaveState()).toBe('spawning');

      // Step enough to spawn all enemies and let them all leak.
      // Path length 39, grunt speed 1.0. With dt=10.0, each update
      // moves 10 tiles. After 4 updates (40s elapsed), all 5 grunts
      // spawned (last at t=4) and all have leaked (need 39s to traverse).
      for (let i = 0; i < 5; i++) {
        runner.update(10.0, map);
      }

      expect(runner.isWaveComplete()).toBe(true);
      expect(runner.getWaveState()).toBe('complete');
    });

    it('getAliveEnemies returns only alive enemies', () => {
      const map = loadGameMap('map_single_path');
      const runner = new WaveRunner();
      runner.startWave(1, waveTable, enemyData, medium, map);

      // Spawn all enemies
      runner.update(5.0, map);
      const alive = runner.getAliveEnemies();
      expect(alive.length).toBe(5);
      for (const e of alive) {
        expect(e.status).toBe('alive');
      }
    });
  });
});
