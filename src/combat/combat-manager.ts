import type { Tower } from '../towers/tower';
import type { Enemy } from '../enemies/enemy';
import type { EconomyManager } from '../economy/economy-manager';
import type { TargetingMode } from '../logic/types';
import { acquireTarget } from '../logic/targeting';
import { getEffectiveSpeed } from '../logic/damage';
import { applyTowerDamage } from './damage-application';
import { tickDoTs } from './dot-manager';
import { applyAuras, clearAuras } from './aura-manager';
import { ProjectileManager } from './projectile';
import type { MuzzleFlashManager } from './muzzle-flash';

/**
 * Orchestrates combat resolution during the game loop's update phase.
 * Each tick runs: aura apply → tower fire → DoT tick → slow expiry →
 * death check (gold rewards) → aura clear.
 */
export class CombatManager {
  private economyManager: EconomyManager;
  private projectileManager: ProjectileManager;
  private muzzleFlashManager: MuzzleFlashManager | null;

  constructor(
    economyManager: EconomyManager,
    projectileManager?: ProjectileManager,
    muzzleFlashManager?: MuzzleFlashManager | null,
  ) {
    this.economyManager = economyManager;
    this.projectileManager = projectileManager ?? new ProjectileManager();
    this.muzzleFlashManager = muzzleFlashManager ?? null;
  }

  /**
   * Runs one combat tick. Call during the game loop's update(dt) phase.
   * Towers fire at enemies, DoTs tick, slows expire, and dead enemies
   * award gold via the economy manager.
   */
  update(dt: number, towers: Tower[], enemies: Enemy[]): void {
    // 1. Aura pass — apply buffs before combat so buffed towers fire with increased stats
    applyAuras(towers);

    // 2. Tower fire pass
    for (const tower of towers) {
      const stats = tower.getStats();

      // Skip non-combat towers (aura, economy)
      if (stats.targeting === 'none' || stats.damage === 0) continue;

      // Decrement cooldown timer
      if (tower.cooldownTimer > 0) {
        tower.cooldownTimer -= dt;
      }

      // Not ready to fire yet
      if (tower.cooldownTimer > 0) continue;

      // Acquire target using effective range (may be buffed by auras)
      const targetRuntime = acquireTarget(
        enemies,
        tower.tileX,
        tower.tileY,
        tower.effectiveRange,
        stats.targeting as TargetingMode,
        stats.hitsAir,
      );

      if (!targetRuntime) continue;

      // Find the Enemy instance by ID (acquireTarget returns RuntimeEnemy)
      const target = enemies.find((e) => e.id === targetRuntime.id);
      if (!target || target.status !== 'alive') continue;

      // Fire — apply damage/effects per tower type
      applyTowerDamage(tower, target, enemies, this.economyManager);

      // Visual feedback
      this.projectileManager.spawnProjectile(
        tower.tileX,
        tower.tileY,
        target.x,
        target.y,
        tower.archetype.archetype,
        tower.archetype.presentation?.projectileSprite,
      );

      // Muzzle flash visual feedback
      this.muzzleFlashManager?.spawnFlash(
        tower.tileX,
        tower.tileY,
        target.x,
        target.y,
        tower.archetype.archetype,
      );

      // Reset cooldown using effective cooldown (may be shortened by aura fire-rate buff)
      tower.cooldownTimer = tower.effectiveCooldown;
    }

    // 3. DoT tick pass
    tickDoTs(enemies, dt);

    // 4. Slow expiry pass
    this.tickSlows(enemies, dt);

    // 5. Death check — set status and trigger gold rewards
    this.processDeaths(enemies);

    // 6. Aura clear — reset all tower buffs to base (reapplied next tick)
    clearAuras(towers);

    // Update projectile lifetimes
    this.projectileManager.update(dt);
  }

  /** Returns the projectile manager for rendering. */
  getProjectileManager(): ProjectileManager {
    return this.projectileManager;
  }

  /**
   * Decrements slow effect durations and recalculates effective speed.
   * When all slows expire, speed returns to base.
   */
  private tickSlows(enemies: Enemy[], dt: number): void {
    for (const enemy of enemies) {
      if (enemy.status !== 'alive') continue;
      if (enemy.activeSlowEffects.length === 0) continue;

      enemy.activeSlowEffects = enemy.activeSlowEffects
        .map((effect) => ({ ...effect, duration: effect.duration - dt }))
        .filter((effect) => effect.duration > 0);

      enemy.currentSpeed = getEffectiveSpeed(enemy.speed, enemy.activeSlowEffects);
    }
  }

  /**
   * Processes enemy deaths: sets status to 'dead' for enemies with hp <= 0,
   * and awards gold via the economy manager for each newly-dead enemy.
   */
  private processDeaths(enemies: Enemy[]): void {
    for (const enemy of enemies) {
      if (enemy.hp <= 0 && enemy.status === 'alive') {
        enemy.status = 'dead';
      }
      if (enemy.status === 'dead' && !enemy.rewardClaimed) {
        enemy.rewardClaimed = true;
        this.economyManager.processEnemyKill(enemy);
      }
    }
  }
}

