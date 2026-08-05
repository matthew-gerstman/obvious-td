import { describe, it, expect } from 'vitest';
import {
  calculateDPS,
  calculateBurstDPS,
  calculateCostPerDPS,
  calculateMarginalEfficiency,
  applyArmor,
  calculateDoTTotal,
  getEffectiveSpeed,
  calculateSplashTargets,
} from '../../../src/logic/damage';
import type { RuntimeEnemy, SlowEffect } from '../../../src/logic/types';

describe('Damage & DPS', () => {
  describe('calculateDPS', () => {
    it('returns damage / cooldown', () => {
      expect(calculateDPS(40, 1.2)).toBeCloseTo(33.333, 2);
    });

    it('handles high damage, low cooldown', () => {
      expect(calculateDPS(80, 2.0)).toBeCloseTo(40, 5);
    });
  });

  describe('calculateBurstDPS', () => {
    it('returns (damage * hitsPerBurst) / (burstDuration + cooldown)', () => {
      // (100 * 3) / (1.5 + 2.0) = 300 / 3.5 = 85.714...
      expect(calculateBurstDPS(100, 3, 1.5, 2.0)).toBeCloseTo(85.714, 2);
    });
  });

  describe('calculateCostPerDPS', () => {
    it('returns totalGoldInvested / dps', () => {
      // 120 / (40/1.2) = 120 / 33.333... = 3.6
      const dps = calculateDPS(40, 1.2);
      expect(calculateCostPerDPS(120, dps)).toBeCloseTo(3.6, 5);
    });
  });

  describe('calculateMarginalEfficiency', () => {
    it('returns (newCost - prevCost) / (newDPS - prevDPS)', () => {
      // (200 - 120) / (50 - 33.333) = 80 / 16.667 = 4.8
      expect(calculateMarginalEfficiency(120, 33.333, 200, 50)).toBeCloseTo(4.8, 1);
    });
  });

  describe('applyArmor', () => {
    it('reduces damage by armor percentage', () => {
      expect(applyArmor(100, 0.5, false)).toBe(50);
    });

    it('ignores armor when armor-piercing', () => {
      expect(applyArmor(100, 0.5, true)).toBe(100);
    });

    it('passes full damage when armor is 0', () => {
      expect(applyArmor(100, 0, false)).toBe(100);
    });
  });

  describe('calculateDoTTotal', () => {
    it('returns dotDamage * dotTicks', () => {
      // Poison tower tier 1: dotDamage=4, dotTicks=6 -> 24
      expect(calculateDoTTotal(4, 6)).toBe(24);
      // Poison tower tier 3: dotDamage=12, dotTicks=8 -> 96
      expect(calculateDoTTotal(12, 8)).toBe(96);
    });
  });

  describe('getEffectiveSpeed', () => {
    it('returns base speed with no slow effects', () => {
      expect(getEffectiveSpeed(1.0, [])).toBe(1.0);
    });

    it('returns minimum speed (strongest slow wins)', () => {
      const effects: SlowEffect[] = [
        { factor: 0.5, duration: 2 },
        { factor: 0.7, duration: 1 },
      ];
      expect(getEffectiveSpeed(1.0, effects)).toBe(0.5);
    });

    it('does not stack additively', () => {
      // If they stacked: 1.0 * (1 - (0.5 + 0.3)) = 0.2
      // Strongest slow: 1.0 * 0.5 = 0.5
      const effects: SlowEffect[] = [
        { factor: 0.5, duration: 2 },
        { factor: 0.7, duration: 1 },
      ];
      expect(getEffectiveSpeed(1.0, effects)).not.toBe(0.2);
    });
  });

  describe('calculateSplashTargets', () => {
    const enemies: RuntimeEnemy[] = [
      { id: 'e1', x: 0, y: 0, hp: 100, maxHP: 100, speed: 1, flying: false, pathProgress: 0, armor: 0 },
      { id: 'e2', x: 1, y: 0, hp: 100, maxHP: 100, speed: 1, flying: false, pathProgress: 0.5, armor: 0 },
      { id: 'e3', x: 3, y: 0, hp: 100, maxHP: 100, speed: 1, flying: false, pathProgress: 0.8, armor: 0 },
      { id: 'e4', x: 5, y: 5, hp: 100, maxHP: 100, speed: 1, flying: false, pathProgress: 0.2, armor: 0 },
    ];

    it('returns enemies within radius', () => {
      const targets = calculateSplashTargets(0, 0, 1.5, enemies);
      expect(targets).toHaveLength(2);
      expect(targets.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
    });

    it('returns empty array when no enemies in range', () => {
      const targets = calculateSplashTargets(100, 100, 1.0, enemies);
      expect(targets).toHaveLength(0);
    });
  });
});

