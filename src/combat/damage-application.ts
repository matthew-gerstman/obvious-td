import type { Tower } from '../towers/tower';
import type { Enemy } from '../enemies/enemy';
import type { EconomyManager } from '../economy/economy-manager';
import { calculateSplashTargets } from '../logic/damage';
import { applyDoT } from './dot-manager';

/**
 * Applies tower damage to the target based on the tower's archetype.
 * Each archetype has a distinct damage profile:
 * - Gatling: single-target
 * - Cannon: splash (full damage to all in radius, no falloff)
 * - Frost: single-target damage + slow effect
 * - Poison: instant armor-piercing damage + DoT
 * - Sniper: high single-target burst
 * - Aura/Economy: no combat action
 */
export function applyTowerDamage(
  tower: Tower,
  target: Enemy,
  allEnemies: Enemy[],
  _economyManager: EconomyManager,
): void {
  const stats = tower.getStats();
  const archetype = tower.archetype.archetype;
  const damage = tower.effectiveDamage;

  switch (archetype) {
    case 'gatling':
      target.takeDamage(damage, stats.armorPiercing);
      break;

    case 'cannon': {
      const splashRadius = stats.splashRadius ?? 0;
      const aliveEnemies = allEnemies.filter((e) => e.status === 'alive');
      // calculateSplashTargets returns the same objects from the input array,
      // so the cast to Enemy[] is safe.
      const splashTargets = calculateSplashTargets(
        target.x,
        target.y,
        splashRadius,
        aliveEnemies,
      ) as Enemy[];
      for (const enemy of splashTargets) {
        enemy.takeDamage(damage, stats.armorPiercing);
      }
      break;
    }

    case 'frost':
      target.takeDamage(damage, false);
      target.applySlow(stats.slowFactor ?? 1, stats.slowDuration ?? 0);
      break;

    case 'poison':
      target.takeDamage(damage, true);
      if (stats.dotDamage && stats.dotTicks && stats.dotDuration) {
        const tickInterval = stats.dotDuration / stats.dotTicks;
        applyDoT(target, stats.dotDamage, stats.dotTicks, tickInterval);
      }
      break;

    case 'sniper':
      target.takeDamage(damage, stats.armorPiercing);
      break;

    case 'aura':
    case 'economy':
      // No combat action — buff/income handled by respective managers
      break;
  }
}

