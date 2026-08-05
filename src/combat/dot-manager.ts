import type { Enemy } from '../enemies/enemy';
import type { DoTEffect } from '../logic/types';

/**
 * Adds a DoT effect to the enemy's active effects list.
 * Multiple DoT effects on the same enemy tick independently (they stack).
 */
export function applyDoT(
  enemy: Enemy,
  dotDamage: number,
  dotTicks: number,
  tickInterval: number,
): void {
  if (enemy.status !== 'alive') return;
  if (dotTicks <= 0 || tickInterval <= 0) return;

  enemy.activeDoTEffects.push({
    dotDamage,
    remainingTicks: dotTicks,
    tickInterval,
    tickTimer: 0,
  });
}

/**
 * Advances all DoT effects on every enemy by dt seconds.
 * When tickTimer >= tickInterval, applies dotDamage (armor-piercing) and
 * decrements remainingTicks. Removes expired effects.
 */
export function tickDoTs(enemies: Enemy[], dt: number): void {
  for (const enemy of enemies) {
    if (enemy.status !== 'alive') continue;
    if (enemy.activeDoTEffects.length === 0) continue;

    const surviving: DoTEffect[] = [];
    for (const effect of enemy.activeDoTEffects) {
      effect.tickTimer += dt;

      while (effect.tickTimer >= effect.tickInterval && effect.remainingTicks > 0) {
        effect.tickTimer -= effect.tickInterval;
        effect.remainingTicks--;
        enemy.takeDamage(effect.dotDamage, true);
        if (enemy.status !== 'alive') break;
      }

      if (effect.remainingTicks > 0) {
        surviving.push(effect);
      }
    }
    enemy.activeDoTEffects = surviving;
  }
}

