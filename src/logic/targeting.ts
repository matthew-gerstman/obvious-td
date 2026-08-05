import type { RuntimeEnemy, TargetingMode } from './types';

function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

export function targetFirst(enemies: RuntimeEnemy[]): RuntimeEnemy | null {
  if (enemies.length === 0) return null;
  let best = enemies[0];
  if (!best) return null;
  for (let i = 1; i < enemies.length; i++) {
    const current = enemies[i];
    if (current && current.pathProgress > best.pathProgress) {
      best = current;
    }
  }
  return best;
}

export function targetLast(enemies: RuntimeEnemy[]): RuntimeEnemy | null {
  if (enemies.length === 0) return null;
  let best = enemies[0];
  if (!best) return null;
  for (let i = 1; i < enemies.length; i++) {
    const current = enemies[i];
    if (current && current.pathProgress < best.pathProgress) {
      best = current;
    }
  }
  return best;
}

export function targetStrong(enemies: RuntimeEnemy[]): RuntimeEnemy | null {
  if (enemies.length === 0) return null;
  let best = enemies[0];
  if (!best) return null;
  for (let i = 1; i < enemies.length; i++) {
    const current = enemies[i];
    if (current && current.hp > best.hp) {
      best = current;
    }
  }
  return best;
}

export function targetClose(
  enemies: RuntimeEnemy[],
  towerX: number,
  towerY: number,
): RuntimeEnemy | null {
  if (enemies.length === 0) return null;
  let best = enemies[0];
  if (!best) return null;
  let bestDist = distance(best.x, best.y, towerX, towerY);
  for (let i = 1; i < enemies.length; i++) {
    const current = enemies[i];
    if (!current) continue;
    const currentDist = distance(current.x, current.y, towerX, towerY);
    if (currentDist < bestDist) {
      best = current;
      bestDist = currentDist;
    }
  }
  return best;
}

export function acquireTarget(
  enemies: RuntimeEnemy[],
  towerX: number,
  towerY: number,
  range: number,
  targetingMode: TargetingMode,
  hitsAir: boolean,
): RuntimeEnemy | null {
  const inRange = enemies.filter((enemy) => {
    const dist = distance(enemy.x, enemy.y, towerX, towerY);
    if (dist > range) return false;
    if (enemy.flying && !hitsAir) return false;
    return true;
  });

  if (inRange.length === 0) return null;

  switch (targetingMode) {
    case 'first':
      return targetFirst(inRange);
    case 'last':
      return targetLast(inRange);
    case 'strong':
      return targetStrong(inRange);
    case 'close':
      return targetClose(inRange, towerX, towerY);
    default:
      return null;
  }
}

