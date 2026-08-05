import type { Tower } from '../towers/tower';

function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Resets all towers to their base stats.
 * Called at the end of each combat tick so buffs are reapplied fresh next tick.
 */
export function clearAuras(towers: Tower[]): void {
  for (const tower of towers) {
    tower.resetEffectiveStats();
  }
}

/**
 * Applies aura tower buffs to nearby towers.
 * For each aura tower, finds all non-aura towers within auraRadius and
 * multiplies their effective stats by the aura's buff multipliers.
 * Multiple auras stack multiplicatively.
 * Aura towers do NOT buff themselves or other aura towers.
 */
export function applyAuras(towers: Tower[]): void {
  for (const auraTower of towers) {
    if (auraTower.archetype.archetype !== 'aura') continue;

    const stats = auraTower.getStats();
    const auraRadius = stats.auraRadius;
    const buffs = stats.auraBuffs;
    if (!auraRadius || !buffs) continue;

    for (const tower of towers) {
      // Aura towers don't buff themselves or other aura towers
      if (tower.id === auraTower.id) continue;
      if (tower.archetype.archetype === 'aura') continue;

      const dist = distance(auraTower.tileX, auraTower.tileY, tower.tileX, tower.tileY);
      if (dist > auraRadius) continue;

      tower.effectiveDamage *= buffs.damageMultiplier;
      tower.effectiveRange *= buffs.rangeMultiplier;
      tower.effectiveCooldown /= buffs.fireRateMultiplier;
    }
  }
}

