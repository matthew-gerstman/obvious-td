import { describe, it, expect } from 'vitest';
import {
  targetFirst,
  targetLast,
  targetStrong,
  targetClose,
  acquireTarget,
} from '../../../src/logic/targeting';
import type { RuntimeEnemy } from '../../../src/logic/types';

function makeEnemy(
  id: string,
  x: number,
  y: number,
  hp: number,
  pathProgress: number,
  flying = false,
): RuntimeEnemy {
  return {
    id,
    x,
    y,
    hp,
    maxHP: hp,
    speed: 1,
    flying,
    pathProgress,
    armor: 0,
  };
}

describe('Targeting', () => {
  const enemies: RuntimeEnemy[] = [
    makeEnemy('e1', 0, 0, 30, 0.2),
    makeEnemy('e2', 3, 0, 80, 0.8),
    makeEnemy('e3', 1, 0, 50, 0.5),
  ];

  describe('targetFirst', () => {
    it('returns enemy with highest pathProgress', () => {
      const target = targetFirst(enemies);
      expect(target?.id).toBe('e2');
      expect(target?.pathProgress).toBe(0.8);
    });

    it('returns null for empty array', () => {
      expect(targetFirst([])).toBeNull();
    });
  });

  describe('targetLast', () => {
    it('returns enemy with lowest pathProgress', () => {
      const target = targetLast(enemies);
      expect(target?.id).toBe('e1');
      expect(target?.pathProgress).toBe(0.2);
    });

    it('returns null for empty array', () => {
      expect(targetLast([])).toBeNull();
    });
  });

  describe('targetStrong', () => {
    it('returns enemy with highest HP', () => {
      const target = targetStrong(enemies);
      expect(target?.id).toBe('e2');
      expect(target?.hp).toBe(80);
    });

    it('returns null for empty array', () => {
      expect(targetStrong([])).toBeNull();
    });
  });

  describe('targetClose', () => {
    it('returns enemy closest to tower', () => {
      // Tower at (0, 0): e1 at dist 0, e2 at dist 3, e3 at dist 1
      const target = targetClose(enemies, 0, 0);
      expect(target?.id).toBe('e1');
    });

    it('returns enemy at distance 1 when distances are 3, 1, 2', () => {
      const testEnemies: RuntimeEnemy[] = [
        makeEnemy('a', 3, 0, 50, 0.5),
        makeEnemy('b', 1, 0, 50, 0.3),
        makeEnemy('c', 2, 0, 50, 0.7),
      ];
      const target = targetClose(testEnemies, 0, 0);
      expect(target?.id).toBe('b');
    });

    it('returns null for empty array', () => {
      expect(targetClose([], 0, 0)).toBeNull();
    });
  });

  describe('acquireTarget', () => {
    it('filters by range and applies targeting mode', () => {
      // Tower at (0, 0) with range 2.5, targeting 'first'
      // e1 at (0,0) dist 0, e2 at (3,0) dist 3 (out of range), e3 at (1,0) dist 1
      const target = acquireTarget(enemies, 0, 0, 2.5, 'first', false);
      expect(target?.id).toBe('e3'); // highest pathProgress in range
    });

    it('returns null when all enemies out of range', () => {
      expect(acquireTarget(enemies, 100, 100, 1.0, 'first', false)).toBeNull();
    });

    it('excludes flying enemies when tower does not hit air', () => {
      const mixedEnemies: RuntimeEnemy[] = [
        makeEnemy('ground', 0, 0, 50, 0.5, false),
        makeEnemy('flyer', 1, 0, 80, 0.8, true),
      ];
      // Non-air tower: should target ground enemy (only valid target)
      const target = acquireTarget(mixedEnemies, 0, 0, 5.0, 'strong', false);
      expect(target?.id).toBe('ground');
    });

    it('targets flying enemies when tower hits air', () => {
      const mixedEnemies: RuntimeEnemy[] = [
        makeEnemy('ground', 0, 0, 50, 0.5, false),
        makeEnemy('flyer', 1, 0, 80, 0.8, true),
      ];
      // Air-capable tower: should target strongest (flyer with 80 HP)
      const target = acquireTarget(mixedEnemies, 0, 0, 5.0, 'strong', true);
      expect(target?.id).toBe('flyer');
    });

    it('returns null when only flying enemies in range and tower does not hit air', () => {
      const flyingOnly: RuntimeEnemy[] = [
        makeEnemy('flyer', 0, 0, 80, 0.8, true),
      ];
      expect(acquireTarget(flyingOnly, 0, 0, 5.0, 'first', false)).toBeNull();
    });
  });
});

