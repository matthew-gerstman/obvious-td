import type { EnemyLogic, TowerData, WaveTable } from './types';

export function calculateRefund(totalInvested: number): number {
  return Math.floor(0.7 * totalInvested);
}

export function getTotalInvested(towerData: TowerData, currentTier: number): number {
  let total = 0;
  for (let i = 0; i < currentTier && i < towerData.logic.tiers.length; i++) {
    const tier = towerData.logic.tiers[i];
    if (tier) total += tier.cost;
  }
  return total;
}

export function calculateUpgradeCost(towerData: TowerData, currentTier: number): number {
  const nextTier = towerData.logic.tiers.find((t) => t.tier === currentTier + 1);
  if (!nextTier) return 0;
  return nextTier.cost;
}

export function calculateIncome(
  incomePerTick: number,
  incomeInterval: number,
  elapsedTicks: number,
  tickDuration: number,
): number {
  // incomeInterval is in seconds; tickDuration is seconds per tick.
  // Total elapsed time = elapsedTicks * tickDuration.
  // Number of payouts = floor(totalTime / incomeInterval).
  const totalSeconds = elapsedTicks * tickDuration;
  const numPayouts = Math.floor(totalSeconds / incomeInterval);
  return numPayouts * incomePerTick;
}

export function calculateWaveGoldReward(
  wave: number,
  enemyData: Record<string, EnemyLogic>,
  waveTable: WaveTable,
  waveClearBonus: number,
): number {
  const waveEntry = waveTable.waves.find((w) => w.wave === wave);
  if (!waveEntry) return waveClearBonus;

  let totalGold = 0;
  for (const entry of waveEntry.enemies) {
    const enemy = enemyData[entry.enemyId];
    if (!enemy) continue;

    const actualCount =
      enemy.spawnCount !== undefined ? entry.count * enemy.spawnCount : entry.count;
    totalGold += enemy.goldReward * actualCount;
  }

  return totalGold + waveClearBonus;
}

