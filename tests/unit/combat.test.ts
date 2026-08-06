import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Tower } from '../../src/towers/tower';
import { Enemy } from '../../src/enemies/enemy';
import { EconomyManager } from '../../src/economy/economy-manager';
import { CombatManager } from '../../src/combat/combat-manager';
import { applyTowerDamage } from '../../src/combat/damage-application';
import { applyDoT, tickDoTs } from '../../src/combat/dot-manager';
import { applyAuras, clearAuras } from '../../src/combat/aura-manager';
import { acquireTarget } from '../../src/logic/targeting';
import { loadTowerData } from './logic/test-helpers';
import type { DifficultyMode, EnemyData, RuntimeEnemy } from '../../src/logic/types';

function makeDifficulty(overrides: Partial<DifficultyMode> = {}): DifficultyMode {
  return {
    hpMultiplier: 1,
    hpScalingRate: 1.15,
    startingGold: 1000,
    startingLives: 20,
    ...overrides,
  };
}

const diff = makeDifficulty();

function loadEnemyData(id: string): EnemyData {
  return JSON.parse(readFileSync(`public/data/archetypes/${id}.json`, 'utf-8')) as EnemyData;
}

function makeEnemy(archetypeId: string, x = 0, y = 0): Enemy {
  const data = loadEnemyData(archetypeId);
  const enemy = new Enemy(data, 1, diff, 'path_1');
  enemy.x = x;
  enemy.y = y;
  return enemy;
}

function makeTower(archetypeId: string, tileX = 0, tileY = 0): Tower {
  const towers = loadTowerData();
  const data = towers.find((t) => t.id === `tower_${archetypeId}`);
  if (!data) throw new Error(`Tower ${archetypeId} not found`);
  return new Tower(`test_${archetypeId}`, data, tileX, tileY);
}

function makeRuntimeEnemy(
  id: string,
  x: number,
  y: number,
  hp: number,
  pathProgress: number,
  flying = false,
  armor = 0,
): RuntimeEnemy {
  return { id, x, y, hp, maxHP: hp, speed: 1, flying, pathProgress, armor };
}

describe('Combat Resolution', () => {
  describe('Target acquisition per mode', () => {
    it('targets first (highest pathProgress)', () => {
      const enemies = [
        makeRuntimeEnemy('e1', 1, 7, 100, 0.3),
        makeRuntimeEnemy('e2', 2, 7, 100, 0.8),
        makeRuntimeEnemy('e3', 3, 7, 100, 0.5),
      ];
      const target = acquireTarget(enemies, 0, 5, 10, 'first', true);
      expect(target?.id).toBe('e2');
    });

    it('targets last (lowest pathProgress)', () => {
      const enemies = [
        makeRuntimeEnemy('e1', 1, 7, 100, 0.3),
        makeRuntimeEnemy('e2', 2, 7, 100, 0.8),
        makeRuntimeEnemy('e3', 3, 7, 100, 0.5),
      ];
      const target = acquireTarget(enemies, 0, 5, 10, 'last', true);
      expect(target?.id).toBe('e1');
    });

    it('targets strong (highest HP)', () => {
      const enemies = [
        makeRuntimeEnemy('e1', 1, 7, 50, 0.3),
        makeRuntimeEnemy('e2', 2, 7, 200, 0.8),
        makeRuntimeEnemy('e3', 3, 7, 100, 0.5),
      ];
      const target = acquireTarget(enemies, 0, 5, 10, 'strong', true);
      expect(target?.id).toBe('e2');
    });

    it('targets close (nearest to tower)', () => {
      const enemies = [
        makeRuntimeEnemy('e1', 1, 7, 100, 0.3),
        makeRuntimeEnemy('e2', 5, 7, 100, 0.8),
        makeRuntimeEnemy('e3', 3, 7, 100, 0.5),
      ];
      const target = acquireTarget(enemies, 3, 5, 10, 'close', true);
      expect(target?.id).toBe('e3');
    });
  });

  describe('Damage application', () => {
    it('Gatling tower deals correct damage to unarmored grunt', () => {
      const tower = makeTower('gatling', 3, 5);
      const enemy = makeEnemy('enemy_grunt', 3, 7);
      const economy = new EconomyManager();
      economy.initialize(diff);

      const initialHP = enemy.hp; // 60
      applyTowerDamage(tower, enemy, [enemy], economy);

      // Gatling tier 1: damage 5, non-AP. Grunt armor 0.
      expect(enemy.hp).toBe(initialHP - 5);
    });
  });

  describe('Splash damage', () => {
    it('Cannon hits all enemies in splash radius, misses those outside', () => {
      const tower = makeTower('cannon', 3, 5);
      const target = makeEnemy('enemy_grunt', 3, 7);
      const nearby1 = makeEnemy('enemy_grunt', 4, 7);
      const nearby2 = makeEnemy('enemy_grunt', 3, 8);
      const outside = makeEnemy('enemy_grunt', 10, 10);
      const economy = new EconomyManager();
      economy.initialize(diff);

      const enemies = [target, nearby1, nearby2, outside];
      const initialHPs = enemies.map((e) => e.hp);

      applyTowerDamage(tower, target, enemies, economy);

      // Cannon tier 1: damage 40, splashRadius 1.5
      // Target at (3,7), nearby1 at (4,7) dist=1, nearby2 at (3,8) dist=1
      // Outside at (10,10) dist ~7.6 — not in radius
      expect(target.hp).toBe(initialHPs[0]! - 40);
      expect(nearby1.hp).toBe(initialHPs[1]! - 40);
      expect(nearby2.hp).toBe(initialHPs[2]! - 40);
      expect(outside.hp).toBe(initialHPs[3]); // No damage
    });
  });

  describe('DoT (damage over time)', () => {
    it('Poison tower applies instant damage then DoT ticks', () => {
      const tower = makeTower('poison', 3, 5);
      const enemy = makeEnemy('enemy_grunt', 3, 7);
      const economy = new EconomyManager();
      economy.initialize(diff);

      const initialHP = enemy.hp; // 60

      applyTowerDamage(tower, enemy, [enemy], economy);

      // Poison tier 1: damage 5 (instant, AP), dotDamage 4, dotTicks 6, dotDuration 3
      // tickInterval = 3/6 = 0.5
      expect(enemy.hp).toBe(initialHP - 5); // Instant damage
      expect(enemy.activeDoTEffects.length).toBe(1);

      // Tick all 6 times
      for (let i = 0; i < 6; i++) {
        tickDoTs([enemy], 0.5);
      }

      // Total damage = 5 (instant) + 4*6 (DoT) = 29
      expect(enemy.hp).toBe(initialHP - 5 - 24);
      expect(enemy.activeDoTEffects.length).toBe(0);
    });

    it('multiple DoT effects stack independently', () => {
      const enemy = makeEnemy('enemy_grunt', 3, 7);

      applyDoT(enemy, 3, 2, 0.5);
      applyDoT(enemy, 5, 2, 0.5);

      expect(enemy.activeDoTEffects.length).toBe(2);

      // Tick both: each ticks once at 0.5s
      tickDoTs([enemy], 0.5);

      // 3 + 5 = 8 damage from two independent DoTs
      expect(enemy.hp).toBe(60 - 8);
      expect(enemy.activeDoTEffects.length).toBe(2); // Both still have 1 tick left

      tickDoTs([enemy], 0.5);

      // Another 3 + 5 = 8 damage
      expect(enemy.hp).toBe(60 - 16);
      expect(enemy.activeDoTEffects.length).toBe(0); // Both expired
    });
  });

  describe('Slow effect', () => {
    it('Frost tower slows enemy and speed returns after duration', () => {
      const tower = makeTower('frost', 3, 5);
      const enemy = makeEnemy('enemy_grunt', 3, 7);
      const economy = new EconomyManager();
      economy.initialize(diff);

      // Grunt speed = 1.0
      expect(enemy.currentSpeed).toBe(1.0);

      applyTowerDamage(tower, enemy, [enemy], economy);

      // Frost tier 1: slowFactor 0.5, slowDuration 1.5
      expect(enemy.currentSpeed).toBe(0.5);

      // Tick slows via combat manager until expired
      const combatManager = new CombatManager(economy);
      for (let i = 0; i < 20; i++) {
        combatManager.update(0.1, [], [enemy]);
      }

      // After 2.0 seconds (20 * 0.1), slow expired (duration was 1.5)
      expect(enemy.currentSpeed).toBe(1.0);
    });
  });

  describe('Armor mitigation', () => {
    it('Non-AP damage is reduced by armor', () => {
      const enemy = makeEnemy('enemy_armored', 3, 7);
      // Armored: armor 0.5, HP 100
      expect(enemy.armor).toBe(0.5);

      enemy.takeDamage(10, false);
      // Effective damage = 10 * (1 - 0.5) = 5
      expect(enemy.hp).toBe(100 - 5);
    });

    it('AP damage ignores armor', () => {
      const enemy = makeEnemy('enemy_armored', 3, 7);

      enemy.takeDamage(10, true);
      // AP damage = 10 (ignores armor)
      expect(enemy.hp).toBe(100 - 10);
    });

    it('Gatling (non-AP) vs armored enemy', () => {
      const tower = makeTower('gatling', 3, 5);
      const enemy = makeEnemy('enemy_armored', 3, 7);
      const economy = new EconomyManager();
      economy.initialize(diff);

      const initialHP = enemy.hp; // 100
      applyTowerDamage(tower, enemy, [enemy], economy);

      // Gatling damage 5, non-AP, armor 0.5
      // Effective = 5 * (1 - 0.5) = 2.5
      expect(enemy.hp).toBe(initialHP - 2.5);
    });

    it('Sniper (AP) vs armored enemy', () => {
      const tower = makeTower('sniper', 3, 5);
      const enemy = makeEnemy('enemy_armored', 3, 7);
      const economy = new EconomyManager();
      economy.initialize(diff);

      const initialHP = enemy.hp; // 100
      applyTowerDamage(tower, enemy, [enemy], economy);

      // Sniper damage 80, AP — ignores armor
      expect(enemy.hp).toBe(initialHP - 80);
    });
  });

  describe('Flyer/air-capable targeting', () => {
    it('Gatling (hitsAir: false) cannot target flying enemy', () => {
      const tower = makeTower('gatling', 3, 5);
      const flyer = makeEnemy('enemy_flyer', 3, 7);
      const economy = new EconomyManager();
      economy.initialize(diff);

      const combatManager = new CombatManager(economy);
      const initialHP = flyer.hp;

      combatManager.update(0.1, [tower], [flyer]);

      expect(flyer.hp).toBe(initialHP); // No damage
    });

    it('Cannon (hitsAir: true) can target and damage flying enemy', () => {
      const tower = makeTower('cannon', 3, 5);
      const flyer = makeEnemy('enemy_flyer', 3, 7);
      const economy = new EconomyManager();
      economy.initialize(diff);

      const combatManager = new CombatManager(economy);
      const initialHP = flyer.hp;

      combatManager.update(0.1, [tower], [flyer]);

      expect(flyer.hp).toBeLessThan(initialHP); // Took damage
    });
  });

  describe('Aura buffs', () => {
    it('Aura tower increases nearby tower effective damage', () => {
      const gatling = makeTower('gatling', 3, 5);
      const aura = makeTower('aura', 4, 5);

      const baseDamage = gatling.effectiveDamage; // 5

      applyAuras([aura, gatling]);

      // Aura tier 1: damageMultiplier 1.25
      expect(gatling.effectiveDamage).toBe(baseDamage * 1.25);

      clearAuras([aura, gatling]);
      expect(gatling.effectiveDamage).toBe(baseDamage);
    });

    it('Tower outside aura radius gets no buff', () => {
      const gatling = makeTower('gatling', 10, 10);
      const aura = makeTower('aura', 3, 5);

      const baseDamage = gatling.effectiveDamage;

      applyAuras([aura, gatling]);

      // Distance from (3,5) to (10,10) = sqrt(49+25) ~ 8.6 > auraRadius 2.0
      expect(gatling.effectiveDamage).toBe(baseDamage);
    });

    it('Aura tower does not buff itself or other aura towers', () => {
      const aura1 = makeTower('aura', 3, 5);
      const aura2 = makeTower('aura', 4, 5);

      const baseDamage = aura1.effectiveDamage; // 0

      applyAuras([aura1, aura2]);

      expect(aura1.effectiveDamage).toBe(baseDamage); // Still 0
      expect(aura2.effectiveDamage).toBe(0);
    });
  });

  describe('Multiple auras', () => {
    it('Two aura towers stack multiplicatively', () => {
      const gatling = makeTower('gatling', 3, 5);
      const aura1 = makeTower('aura', 2, 5);
      const aura2 = makeTower('aura', 4, 5);

      const baseDamage = gatling.effectiveDamage; // 5

      applyAuras([aura1, aura2, gatling]);

      // Both auras have damageMultiplier 1.25
      // Stacked: 5 * 1.25 * 1.25 = 7.8125
      expect(gatling.effectiveDamage).toBe(baseDamage * 1.25 * 1.25);
    });
  });

  describe('Economy tower in combat', () => {
    it('Economy tower does not acquire targets or deal damage', () => {
      const economyTower = makeTower('economy', 3, 5);
      const enemy = makeEnemy('enemy_grunt', 3, 7);
      const economy = new EconomyManager();
      economy.initialize(diff);

      const combatManager = new CombatManager(economy);
      const initialHP = enemy.hp;

      combatManager.update(0.1, [economyTower], [enemy]);

      expect(enemy.hp).toBe(initialHP); // No damage
    });
  });

  describe('Combat manager integration', () => {
    it('Tower fires on first tick when cooldown is 0', () => {
      const tower = makeTower('gatling', 3, 5);
      const enemy = makeEnemy('enemy_grunt', 3, 7);
      const economy = new EconomyManager();
      economy.initialize(diff);

      const combatManager = new CombatManager(economy);
      const initialHP = enemy.hp;

      combatManager.update(0.1, [tower], [enemy]);

      expect(enemy.hp).toBeLessThan(initialHP);
    });

    it('Tower respects cooldown timer', () => {
      const tower = makeTower('gatling', 3, 5);
      const enemy = makeEnemy('enemy_armored', 3, 7); // HP 100, won't die quickly
      const economy = new EconomyManager();
      economy.initialize(diff);

      const combatManager = new CombatManager(economy);

      // Tick 1: fires (cooldownTimer = 0)
      combatManager.update(0.15, [tower], [enemy]);
      const hpAfterFirstShot = enemy.hp;

      // Tick 2: cooldown not expired (0.3 - 0.15 = 0.15 > 0)
      combatManager.update(0.15, [tower], [enemy]);
      expect(enemy.hp).toBe(hpAfterFirstShot); // No change

      // Tick 3: cooldown expired (0.15 - 0.15 = 0), fires again
      combatManager.update(0.15, [tower], [enemy]);
      expect(enemy.hp).toBeLessThan(hpAfterFirstShot);
    });

    it('Death check awards gold via economy manager', () => {
      const tower = makeTower('sniper', 3, 5); // damage 80
      const enemy = makeEnemy('enemy_grunt', 3, 7); // HP 60
      const economy = new EconomyManager();
      economy.initialize(diff);

      const goldBefore = economy.getGold();
      const combatManager = new CombatManager(economy);

      // One shot kills the grunt (80 > 60)
      combatManager.update(0.1, [tower], [enemy]);

      expect(enemy.status).toBe('dead');
      expect(economy.getGold()).toBe(goldBefore + enemy.goldReward);
    });

    it('Aura-buffed tower deals increased damage in combat', () => {
      const gatling = makeTower('gatling', 3, 5);
      const aura = makeTower('aura', 4, 5);
      const enemy = makeEnemy('enemy_grunt', 3, 7);
      const economy = new EconomyManager();
      economy.initialize(diff);

      const combatManager = new CombatManager(economy);

      // First tick: aura applies, gatling fires with buffed damage
      combatManager.update(0.1, [aura, gatling], [enemy]);

      // Gatling base damage 5, aura damageMultiplier 1.25
      // Effective damage = 5 * 1.25 = 6.25
      expect(enemy.hp).toBe(60 - 6.25);
    });
  });
});

