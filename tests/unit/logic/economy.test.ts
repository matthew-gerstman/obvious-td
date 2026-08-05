import { describe, it, expect } from 'vitest';
import {
  calculateRefund,
  getTotalInvested,
  calculateUpgradeCost,
  calculateIncome,
  calculateWaveGoldReward,
} from '../../../src/logic/economy';
import { loadTowerData, loadEnemyData, loadWaveTable } from './test-helpers';

describe('Economy', () => {
  describe('calculateRefund', () => {
    it('returns floor(0.7 * totalInvested)', () => {
      expect(calculateRefund(270)).toBe(189);
      expect(calculateRefund(100)).toBe(70);
    });

    it('proves floor, not round', () => {
      // 0.7 * 101 = 70.7, floor = 70 (not 71)
      expect(calculateRefund(101)).toBe(70);
    });

    it('returns 0 for 0 invested', () => {
      expect(calculateRefund(0)).toBe(0);
    });
  });

  describe('getTotalInvested', () => {
    const towers = loadTowerData();
    const gatling = towers.find((t) => t.id === 'tower_gatling')!;

    it('returns base cost at tier 1', () => {
      expect(getTotalInvested(gatling, 1)).toBe(50);
    });

    it('returns base + upgrade costs at tier 2', () => {
      expect(getTotalInvested(gatling, 2)).toBe(50 + 85);
    });

    it('returns base + all upgrade costs at tier 3', () => {
      expect(getTotalInvested(gatling, 3)).toBe(50 + 85 + 140);
    });

    it('refund matches 70% of total invested across upgrade tiers', () => {
      const total = getTotalInvested(gatling, 3); // 275
      expect(calculateRefund(total)).toBe(Math.floor(0.7 * 275)); // 192
    });
  });

  describe('calculateUpgradeCost', () => {
    const towers = loadTowerData();
    const gatling = towers.find((t) => t.id === 'tower_gatling')!;

    it('returns cost of next tier', () => {
      expect(calculateUpgradeCost(gatling, 1)).toBe(85);
      expect(calculateUpgradeCost(gatling, 2)).toBe(140);
    });

    it('returns 0 at max tier', () => {
      expect(calculateUpgradeCost(gatling, 3)).toBe(0);
    });
  });

  describe('calculateIncome', () => {
    it('calculates income over elapsed ticks', () => {
      // Economy tower tier 1: incomePerTick=5, incomeInterval=2
      // 10 ticks * 1s tickDuration = 10s, payouts = floor(10/2) = 5, income = 5*5 = 25
      expect(calculateIncome(5, 2, 10, 1)).toBe(25);
    });

    it('returns 0 when no full interval has elapsed', () => {
      expect(calculateIncome(5, 2, 1, 1)).toBe(0);
    });
  });

  describe('calculateWaveGoldReward', () => {
    const enemyData = loadEnemyData();
    const waveTable = loadWaveTable();

    it('sums enemy gold rewards plus wave-clear bonus', () => {
      // Wave 1: 5 grunts (goldReward=8 each) + 0 bonus = 40
      expect(calculateWaveGoldReward(1, enemyData, waveTable, 0)).toBe(40);
    });

    it('includes wave-clear bonus', () => {
      expect(calculateWaveGoldReward(1, enemyData, waveTable, 20)).toBe(60);
    });

    it('handles swarm enemies with spawnCount', () => {
      // Wave 11: 3 swarm (spawnCount=8, goldReward=3 each)
      // 3 * 8 * 3 = 72
      expect(calculateWaveGoldReward(11, enemyData, waveTable, 0)).toBe(72);
    });
  });
});

