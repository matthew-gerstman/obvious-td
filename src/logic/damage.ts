import type { RuntimeEnemy, SlowEffect } from './types';

export function calculateDPS(damage: number, cooldown: number): number {
  return damage / cooldown;
}

export function calculateBurstDPS(
  damage: number,
  hitsPerBurst: number,
  burstDuration: number,
  cooldown: number,
): number {
  return (damage * hitsPerBurst) / (burstDuration + cooldown);
}

export function calculateCostPerDPS(totalGoldInvested: number, dps: number): number {
  return totalGoldInvested / dps;
}

export function calculateMarginalEfficiency(
  prevCost: number,
  prevDPS: number,
  newCost: number,
  newDPS: number,
): number {
  return (newCost - prevCost) / (newDPS - prevDPS);
}

export function applyArmor(damage: number, armor: number, isArmorPiercing: boolean): number {
  if (isArmorPiercing) return damage;
  return damage * (1 - armor);
}

export function calculateDoTTotal(dotDamage: number, dotTicks: number): number {
  return dotDamage * dotTicks;
}

export function getEffectiveSpeed(baseSpeed: number, slowEffects: SlowEffect[]): number {
  if (slowEffects.length === 0) return baseSpeed;
  // Strongest slow wins — effects do NOT stack additively.
  // A slow factor of 0.5 means 50% speed; the minimum factor is the strongest slow.
  const minFactor = Math.min(...slowEffects.map((e) => e.factor));
  return baseSpeed * minFactor;
}

export function calculateSplashTargets(
  centerX: number,
  centerY: number,
  radius: number,
  enemies: RuntimeEnemy[],
): RuntimeEnemy[] {
  return enemies.filter((enemy) => {
    const dx = enemy.x - centerX;
    const dy = enemy.y - centerY;
    return Math.sqrt(dx * dx + dy * dy) <= radius;
  });
}

