import type { GameMap } from '../maps/map-loader';
import type { TowerData } from '../logic/types';
import { Tower } from './tower';

export interface PlaceTowerResult {
  success: boolean;
  tower?: Tower;
  remainingGold: number;
}

export interface UpgradeTowerResult {
  success: boolean;
  remainingGold: number;
}

export interface SellTowerResult {
  refundAmount: number;
}

/**
 * Manages tower placement, upgrade, and sell operations.
 * Validates tiles against the map and tracks occupied tiles.
 */
export class TowerManager {
  private map: GameMap;
  private towers: Map<string, Tower> = new Map();
  private occupiedTiles: Set<string> = new Set();
  private nextId = 0;

  constructor(map: GameMap) {
    this.map = map;
  }

  /**
   * Places a tower on the map if the tile is buildable, unoccupied, and affordable.
   * Returns the result with the remaining gold.
   */
  placeTower(archetype: TowerData, tileX: number, tileY: number, gold: number): PlaceTowerResult {
    if (!this.map.isBuildable(tileX, tileY)) {
      return { success: false, remainingGold: gold };
    }
    if (this.isTileOccupied(tileX, tileY)) {
      return { success: false, remainingGold: gold };
    }
    const tier1 = archetype.logic.tiers.find((t) => t.tier === 1);
    if (!tier1) throw new Error(`Tower ${archetype.id} has no tier 1`);
    if (gold < tier1.cost) {
      return { success: false, remainingGold: gold };
    }
    const id = `tower_${this.nextId++}`;
    const tower = new Tower(id, archetype, tileX, tileY);
    this.towers.set(id, tower);
    this.occupiedTiles.add(`${tileX},${tileY}`);
    return { success: true, tower, remainingGold: gold - tier1.cost };
  }

  /**
   * Upgrades a tower if it can upgrade and the player has enough gold.
   * Returns the result with the remaining gold.
   */
  upgradeTower(towerId: string, gold: number): UpgradeTowerResult {
    const tower = this.towers.get(towerId);
    if (!tower) return { success: false, remainingGold: gold };
    if (!tower.canUpgrade()) return { success: false, remainingGold: gold };
    const cost = tower.getUpgradeCost();
    if (gold < cost) return { success: false, remainingGold: gold };
    tower.upgrade();
    return { success: true, remainingGold: gold - cost };
  }

  /**
   * Sells a tower, refunding 70% of total invested gold.
   * Frees the tile for new placement.
   */
  sellTower(towerId: string): SellTowerResult {
    const tower = this.towers.get(towerId);
    if (!tower) return { refundAmount: 0 };
    const refund = tower.getSellValue();
    this.occupiedTiles.delete(`${tower.tileX},${tower.tileY}`);
    this.towers.delete(towerId);
    return { refundAmount: refund };
  }

  /** Returns the tower at the given tile, or null if none. */
  getTowerAt(tileX: number, tileY: number): Tower | null {
    for (const tower of this.towers.values()) {
      if (tower.tileX === tileX && tower.tileY === tileY) return tower;
    }
    return null;
  }

  /** Returns true if a tower occupies the given tile. */
  isTileOccupied(tileX: number, tileY: number): boolean {
    return this.occupiedTiles.has(`${tileX},${tileY}`);
  }

  /** Returns true if the tile is buildable (delegates to the map). */
  isBuildable(tileX: number, tileY: number): boolean {
    return this.map.isBuildable(tileX, tileY);
  }

  /** Returns all placed towers. */
  getAllTowers(): Tower[] {
    return Array.from(this.towers.values());
  }

  /** Returns the sum of all towers' DPS. */
  getTotalDPS(): number {
    return this.getAllTowers().reduce((sum, t) => sum + t.getDPS(), 0);
  }
}
