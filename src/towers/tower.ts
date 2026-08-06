import type { TowerData, TowerTier } from '../logic/types';
import { calculateDPS, calculateCostPerDPS } from '../logic/damage';
import { calculateRefund, calculateUpgradeCost } from '../logic/economy';

/**
 * A tower placed on the map.
 * Wraps a TowerData archetype with runtime state: tier, invested gold, cooldown timer.
 */
export class Tower {
  readonly id: string;
  readonly archetype: TowerData;
  tier: number;
  readonly tileX: number;
  readonly tileY: number;
  totalInvested: number;
  cooldownTimer: number;
  stats: TowerTier;
  effectiveDamage: number;
  effectiveRange: number;
  effectiveCooldown: number;

  constructor(id: string, archetype: TowerData, tileX: number, tileY: number) {
    this.id = id;
    this.archetype = archetype;
    this.tier = 1;
    this.tileX = tileX;
    this.tileY = tileY;
    const tier1Stats = archetype.logic.tiers.find((t) => t.tier === 1);
    if (!tier1Stats) throw new Error(`Tower ${archetype.id} has no tier 1 stats`);
    this.totalInvested = tier1Stats.cost;
    this.cooldownTimer = 0;
    this.stats = tier1Stats;
    this.effectiveDamage = tier1Stats.damage;
    this.effectiveRange = tier1Stats.range;
    this.effectiveCooldown = tier1Stats.cooldown;
  }

  /** Resets effective stats to base values. Called by the aura manager before reapplying buffs. */
  resetEffectiveStats(): void {
    const stats = this.getStats();
    this.effectiveDamage = stats.damage;
    this.effectiveRange = stats.range;
    this.effectiveCooldown = stats.cooldown;
  }

  /** Returns the current tier's stats from the archetype data. */
  getStats(): TowerTier {
    const stats = this.archetype.logic.tiers.find((t) => t.tier === this.tier);
    if (!stats) throw new Error(`Tower ${this.archetype.id} has no tier ${this.tier} stats`);
    return stats;
  }

  /** Calculates DPS using WI-2's calculateDPS. Returns 0 for non-offensive towers. */
  getDPS(): number {
    const stats = this.getStats();
    if (stats.damage === 0 || stats.cooldown === 0) return 0;
    return calculateDPS(stats.damage, stats.cooldown);
  }

  /** Calculates cost-per-DPS using WI-2's calculateCostPerDPS. Returns 0 for non-offensive towers. */
  getCostPerDPS(): number {
    const dps = this.getDPS();
    if (dps <= 0) return 0;
    return calculateCostPerDPS(this.totalInvested, dps);
  }

  /** Returns true if the tower can be upgraded (tier < 3). */
  canUpgrade(): boolean {
    return this.tier < 3;
  }

  /** Returns the cost to upgrade to the next tier, or 0 if at max tier. */
  getUpgradeCost(): number {
    return calculateUpgradeCost(this.archetype, this.tier);
  }

  /** Upgrades the tower to the next tier. Adds upgrade cost to totalInvested. */
  upgrade(): void {
    if (!this.canUpgrade()) return;
    const cost = this.getUpgradeCost();
    this.tier++;
    this.totalInvested += cost;
    this.stats = this.getStats();
    this.resetEffectiveStats();
  }

  /** Returns the sell value: floor(0.7 * totalInvested). */
  getSellValue(): number {
    return calculateRefund(this.totalInvested);
  }

  /** Returns the display name from the archetype's presentation data. */
  getDisplayName(): string {
    return this.archetype.presentation?.name ?? this.archetype.archetype;
  }
}
