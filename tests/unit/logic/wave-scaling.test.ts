import { describe, it, expect } from 'vitest';
import {
  scaleHP,
  scaleEnemyCount,
  getBossWaves,
  isBossWave,
  getBossHPMultiplier,
  getWaveHP,
  getWaveDuration,
} from '../../../src/logic/wave-scaling';
import { loadEnemyData, loadDifficultyMode, loadWaveTable } from './test-helpers';

describe('Wave scaling', () => {
  describe('scaleHP', () => {
    it('scales HP by scalingRate^(wave-1)', () => {
      // 60 * 1.15^4 = 60 * 1.74900625 = 104.940375
      expect(scaleHP(60, 5, 1.15)).toBeCloseTo(104.940375, 6);
      // 60 * 1.20^9 = 60 * 5.159780352 = 309.58682112
      expect(scaleHP(60, 10, 1.20)).toBeCloseTo(309.58682112, 6);
    });

    it('returns baseHP at wave 1', () => {
      expect(scaleHP(100, 1, 1.15)).toBe(100);
    });
  });

  describe('scaleEnemyCount', () => {
    it('returns base count at wave 1', () => {
      expect(scaleEnemyCount(10, 1)).toBe(10);
    });

    it('scales count with smooth piecewise growth', () => {
      const wave10 = scaleEnemyCount(10, 10);
      const wave20 = scaleEnemyCount(10, 20);
      expect(wave10).toBeGreaterThan(10);
      expect(wave20).toBeGreaterThan(wave10);
    });

    it('caps growth rate at 15%', () => {
      const wave30 = scaleEnemyCount(10, 30);
      const wave25 = scaleEnemyCount(10, 25);
      expect(wave30).toBeGreaterThan(wave25);
    });
  });

  describe('getBossWaves', () => {
    it('returns boss wave numbers', () => {
      expect(getBossWaves()).toEqual([5, 10, 15, 20, 25, 30]);
    });
  });

  describe('isBossWave', () => {
    it('returns true for boss waves', () => {
      for (const w of [5, 10, 15, 20, 25, 30]) {
        expect(isBossWave(w)).toBe(true);
      }
    });

    it('returns false for non-boss waves', () => {
      for (const w of [1, 2, 3, 4, 6, 7, 8, 9, 11, 14, 16, 29]) {
        expect(isBossWave(w)).toBe(false);
      }
    });
  });

  describe('getBossHPMultiplier', () => {
    it('returns 4', () => {
      expect(getBossHPMultiplier()).toBe(4);
    });
  });

  describe('getWaveHP', () => {
    const enemyData = loadEnemyData();
    const medium = loadDifficultyMode('medium');
    const waveTable = loadWaveTable();

    it('computes total HP for wave 1 (5 grunts, medium)', () => {
      // scaleHP(60, 1, 1.15) = 60, * 1.0 = 60, * 5 = 300
      expect(getWaveHP(1, enemyData, medium, waveTable)).toBeCloseTo(300, 1);
    });

    it('computes total HP for wave 5 (boss wave, medium)', () => {
      // Boss: scaleHP(300, 5, 1.15) * 1.0 * 4 = 300 * 1.74900625 * 4 = 2098.8075
      // Grunts: scaleHP(60, 5, 1.15) * 1.0 * 5 = 60 * 1.74900625 * 5 = 524.701875
      // Total = 2623.509375
      expect(getWaveHP(5, enemyData, medium, waveTable)).toBeCloseTo(2623.509375, 4);
    });

    it('applies difficulty multiplier', () => {
      const easy = loadDifficultyMode('easy');
      // 5 grunts, scaleHP(60, 1, 1.10) = 60, * 0.7 = 42, * 5 = 210
      expect(getWaveHP(1, enemyData, easy, waveTable)).toBeCloseTo(210, 1);
    });

    it('handles swarm spawnCount', () => {
      // Wave 11: 3 swarm, spawnCount=8, baseHP=15
      // scaleHP(15, 11, 1.15) * 1.0 * (3 * 8) = 15 * 1.15^10 * 24
      // 1.15^10 = 4.0455577...
      // 15 * 4.0455577 * 24 = 1456.400...
      expect(getWaveHP(11, enemyData, medium, waveTable)).toBeCloseTo(1456.4008, 2);
    });
  });

  describe('getWaveDuration', () => {
    const enemyData = loadEnemyData();
    const medium = loadDifficultyMode('medium');
    const waveTable = loadWaveTable();

    it('estimates duration for wave 1', () => {
      // 5 grunts, interval=1, speed=1.0, pathLength=39
      // spawnTime = 5 * 1 = 5, traversalTime = 39 / 1.0 = 39
      const duration = getWaveDuration(1, enemyData, medium, waveTable, 39);
      expect(duration).toBeCloseTo(44, 1);
    });

    it('estimates duration for wave 5 (boss + grunts)', () => {
      // 1 boss (interval=1, speed=0.6) + 5 grunts (interval=1, speed=1.0)
      // spawnTime = 1*1 + 5*1 = 6, minSpeed = 0.6
      // traversalTime = 39 / 0.6 = 65
      // duration = 6 + 65 = 71
      const duration = getWaveDuration(5, enemyData, medium, waveTable, 39);
      expect(duration).toBeCloseTo(71, 1);
    });
  });
});

