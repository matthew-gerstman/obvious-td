import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadMap } from '../../src/maps/map-loader';
import { TowerManager } from '../../src/towers/tower-manager';
import { Tower } from '../../src/towers/tower';
import { EconomyManager } from '../../src/economy/economy-manager';
import { loadTowerData, loadDifficultyMode } from './logic/test-helpers';
import type { DifficultyMode } from '../../src/logic/types';

function setupGame(): {
  towers: ReturnType<typeof loadTowerData>;
  economy: EconomyManager;
  manager: TowerManager;
} {
  const mapJson = JSON.parse(readFileSync('data/maps/map_single_path.json', 'utf-8'));
  const gameMap = loadMap(mapJson as object);
  const towers = loadTowerData();
  const diff = loadDifficultyMode('easy');

  const economy = new EconomyManager();
  economy.initialize(diff);

  const manager = new TowerManager(gameMap);

  return { towers, economy, manager };
}

function makeDifficulty(overrides: Partial<DifficultyMode> = {}): DifficultyMode {
  return {
    hpMultiplier: 1,
    hpScalingRate: 1.15,
    startingGold: 200,
    startingLives: 20,
    ...overrides,
  };
}

describe('Tower Placement and Economy', () => {
  describe('placement', () => {
    it('deducts gold on successful placement', () => {
      const { towers, economy, manager } = setupGame();
      const gatling = towers.find((t) => t.id === 'tower_gatling')!;

      const result = manager.placeTower(gatling, 2, 5, economy.getGold());
      expect(result.success).toBe(true);
      expect(result.remainingGold).toBe(150);
      expect(result.tower).toBeDefined();

      economy.spendGold(gatling.logic.tiers[0]!.cost);
      expect(economy.getGold()).toBe(150);
    });

    it('fails on insufficient gold', () => {
      const { towers, manager } = setupGame();
      const sniper = towers.find((t) => t.id === 'tower_sniper')!; // cost 150

      const lowEconomy = new EconomyManager();
      lowEconomy.initialize(makeDifficulty({ startingGold: 30 }));

      const result = manager.placeTower(sniper, 2, 5, lowEconomy.getGold());
      expect(result.success).toBe(false);
      expect(result.remainingGold).toBe(30);
      expect(lowEconomy.getGold()).toBe(30);
    });

    it('fails on non-buildable tile (path tile)', () => {
      const { towers, economy, manager } = setupGame();
      const gatling = towers.find((t) => t.id === 'tower_gatling')!;

      // (0, 7) is a path tile — not buildable
      const result = manager.placeTower(gatling, 0, 7, economy.getGold());
      expect(result.success).toBe(false);
      expect(result.remainingGold).toBe(200);
    });

    it('fails on occupied tile', () => {
      const { towers, economy, manager } = setupGame();
      const gatling = towers.find((t) => t.id === 'tower_gatling')!;

      const r1 = manager.placeTower(gatling, 2, 5, economy.getGold());
      expect(r1.success).toBe(true);

      const frost = towers.find((t) => t.id === 'tower_frost')!;
      const r2 = manager.placeTower(frost, 2, 5, economy.getGold());
      expect(r2.success).toBe(false);
      expect(r2.remainingGold).toBe(200);
    });
  });

  describe('upgrade', () => {
    it('costs correctly: tier 1 to tier 2 deducts the tier-2 upgrade cost', () => {
      const { towers, economy, manager } = setupGame();
      const gatling = towers.find((t) => t.id === 'tower_gatling')!;

      // Place at tier 1 (cost 50)
      const placeResult = manager.placeTower(gatling, 2, 5, economy.getGold());
      expect(placeResult.success).toBe(true);
      economy.spendGold(50);
      expect(economy.getGold()).toBe(150);

      // Upgrade to tier 2 (cost 85)
      const tower = manager.getTowerAt(2, 5)!;
      const upgradeCost = tower.getUpgradeCost();
      expect(upgradeCost).toBe(85);

      const upgradeResult = manager.upgradeTower(tower.id, economy.getGold());
      expect(upgradeResult.success).toBe(true);
      expect(upgradeResult.remainingGold).toBe(65);

      economy.spendGold(upgradeCost);
      expect(economy.getGold()).toBe(65);

      // Tower is now tier 2 with updated stats
      expect(tower.tier).toBe(2);
      expect(tower.totalInvested).toBe(135);
    });

    it('fails at max tier (tier 3)', () => {
      const { towers, manager } = setupGame();
      const gatling = towers.find((t) => t.id === 'tower_gatling')!;

      // Use high starting gold so all upgrades are affordable
      const economy = new EconomyManager();
      economy.initialize(makeDifficulty({ startingGold: 500 }));

      // Place and upgrade to tier 3
      manager.placeTower(gatling, 2, 5, economy.getGold());
      economy.spendGold(50);

      const tower = manager.getTowerAt(2, 5)!;
      manager.upgradeTower(tower.id, economy.getGold());
      economy.spendGold(85);
      expect(tower.tier).toBe(2);

      manager.upgradeTower(tower.id, economy.getGold());
      economy.spendGold(140);
      expect(tower.tier).toBe(3);

      // Try to upgrade past max tier
      const result = manager.upgradeTower(tower.id, economy.getGold());
      expect(result.success).toBe(false);
      expect(tower.tier).toBe(3);
    });
  });

  describe('sell', () => {
    it('returns floor(0.7 * totalInvested) and frees the tile', () => {
      const { towers, economy, manager } = setupGame();
      const gatling = towers.find((t) => t.id === 'tower_gatling')!;

      // Place (50) + upgrade (85) = 135 total invested
      manager.placeTower(gatling, 2, 5, economy.getGold());
      economy.spendGold(50);

      const tower = manager.getTowerAt(2, 5)!;
      manager.upgradeTower(tower.id, economy.getGold());
      economy.spendGold(85);

      expect(tower.totalInvested).toBe(135);
      const expectedRefund = Math.floor(0.7 * 135); // 94
      expect(expectedRefund).toBe(94);

      // Sell
      const sellResult = manager.sellTower(tower.id);
      expect(sellResult.refundAmount).toBe(94);

      // Tile is freed
      expect(manager.isTileOccupied(2, 5)).toBe(false);
      expect(manager.getTowerAt(2, 5)).toBeNull();

      // Gold refunded
      economy.addGold(sellResult.refundAmount);
      expect(economy.getGold()).toBe(200 - 50 - 85 + 94); // 159
    });
  });

  describe('economy tower income', () => {
    it('yields passive income per tick', () => {
      const { towers, manager } = setupGame();
      const economyTower = towers.find((t) => t.id === 'tower_economy')!;

      const economy = new EconomyManager();
      economy.initialize(makeDifficulty({ startingGold: 1000 }));

      // Place economy tower (cost 75)
      manager.placeTower(economyTower, 2, 5, economy.getGold());
      economy.spendGold(75);
      expect(economy.getGold()).toBe(925);

      const tower = manager.getTowerAt(2, 5)!;
      const stats = tower.getStats();
      expect(stats.incomePerTick).toBe(5);
      expect(stats.incomeInterval).toBe(2);

      // Process 10 ticks at dt=1 second each
      // After 10 seconds: floor(10/2) = 5 payouts * 5 gold = 25
      const goldBefore = economy.getGold();
      for (let i = 0; i < 10; i++) {
        economy.processEconomyIncome(manager.getAllTowers(), 1);
      }
      const goldAfter = economy.getGold();
      expect(goldAfter - goldBefore).toBe(25);
    });
  });

  describe('cost-per-DPS', () => {
    const towers = loadTowerData();

    it('is positive for offensive towers', () => {
      const offensiveIds = ['tower_gatling', 'tower_cannon', 'tower_frost', 'tower_poison', 'tower_sniper'];
      for (const id of offensiveIds) {
        const data = towers.find((t) => t.id === id)!;
        const tower = new Tower('test', data, 0, 0);
        expect(tower.getCostPerDPS()).toBeGreaterThan(0);
      }
    });

    it('is zero for non-offensive towers (aura, economy)', () => {
      const nonOffensiveIds = ['tower_aura', 'tower_economy'];
      for (const id of nonOffensiveIds) {
        const data = towers.find((t) => t.id === id)!;
        const tower = new Tower('test', data, 0, 0);
        expect(tower.getCostPerDPS()).toBe(0);
      }
    });
  });
});

