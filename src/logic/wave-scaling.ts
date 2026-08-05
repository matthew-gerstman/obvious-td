import type { DifficultyMode, EnemyLogic, WaveTable } from './types';

export function scaleHP(baseHP: number, wave: number, scalingRate: number): number {
  return baseHP * Math.pow(scalingRate, wave - 1);
}

export function scaleEnemyCount(baseCount: number, wave: number): number {
  // Smooth piecewise growth: 5% at wave 1 ramping to 10% by wave 10,
  // then 10% ramping to 15% by wave 20, capped at 15%.
  const rate =
    wave <= 10
      ? 0.05 + (wave - 1) * 0.005
      : Math.min(0.15, 0.10 + (wave - 10) * 0.005);
  return Math.floor(baseCount * Math.pow(1 + rate, wave - 1));
}

export function getBossWaves(): number[] {
  return [5, 10, 15, 20, 25, 30];
}

export function isBossWave(wave: number): boolean {
  return getBossWaves().includes(wave);
}

export function getBossHPMultiplier(): number {
  return 4;
}

export function getWaveHP(
  wave: number,
  enemyData: Record<string, EnemyLogic>,
  difficulty: DifficultyMode,
  waveTable: WaveTable,
): number {
  const waveEntry = waveTable.waves.find((w) => w.wave === wave);
  if (!waveEntry) return 0;

  const { hpScalingRate, hpMultiplier } = difficulty;
  const bossMultiplier = isBossWave(wave) ? getBossHPMultiplier() : 1;

  let totalHP = 0;
  for (const entry of waveEntry.enemies) {
    const enemy = enemyData[entry.enemyId];
    if (!enemy) continue;

    const scaledHP = scaleHP(enemy.baseHP, wave, hpScalingRate) * hpMultiplier;
    const effectiveHP = enemy.isBoss ? scaledHP * bossMultiplier : scaledHP;
    const actualCount =
      enemy.spawnCount !== undefined ? entry.count * enemy.spawnCount : entry.count;

    totalHP += effectiveHP * actualCount;
  }

  return totalHP;
}

export function getWaveDuration(
  wave: number,
  enemyData: Record<string, EnemyLogic>,
  _difficulty: DifficultyMode,
  waveTable: WaveTable,
  mapPathLength: number,
): number {
  const waveEntry = waveTable.waves.find((w) => w.wave === wave);
  if (!waveEntry) return 0;

  let spawnTime = 0;
  let minSpeed = Infinity;

  for (const entry of waveEntry.enemies) {
    const enemy = enemyData[entry.enemyId];
    if (!enemy) continue;

    const actualCount =
      enemy.spawnCount !== undefined ? entry.count * enemy.spawnCount : entry.count;
    spawnTime += actualCount * entry.interval;
    if (enemy.speed < minSpeed) {
      minSpeed = enemy.speed;
    }
  }

  if (minSpeed === Infinity || minSpeed <= 0) {
    return spawnTime;
  }

  const traversalTime = mapPathLength / minSpeed;
  return spawnTime + traversalTime;
}

