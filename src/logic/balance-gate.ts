import type {
  BalanceResult,
  DifficultyMode,
  EnemyLogic,
  MapData,
  PlacedTower,
  WaveTable,
} from './types';
import { calculateDPS } from './damage';
import { getWaveHP, getWaveDuration, isBossWave } from './wave-scaling';
import { calculateWaveGoldReward } from './economy';

function computePathLength(map: MapData): number {
  const path = map.logic.paths[0];
  if (!path) return 0;

  let length = 0;
  for (let i = 1; i < path.waypoints.length; i++) {
    const prev = path.waypoints[i - 1];
    const curr = path.waypoints[i];
    if (!prev || !curr) continue;
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

export function checkWaveBalance(
  wave: number,
  map: MapData,
  difficulty: DifficultyMode,
  towers: PlacedTower[],
  enemyData: Record<string, EnemyLogic>,
  waveTable: WaveTable,
): BalanceResult {
  const waveHP = getWaveHP(wave, enemyData, difficulty, waveTable);

  // Simplified model: sum raw DPS of all placed damage-dealing towers.
  // Does not simulate spatial coverage (which enemies are actually in range).
  // This overestimates effective DPS but provides a conservative balance check.
  let playerDPS = 0;
  let totalInvested = 0;
  let damageTowerCount = 0;

  for (const tower of towers) {
    const tier = tower.towerData.logic.tiers[tower.tier - 1];
    if (!tier || tier.damage === 0 || tier.cooldown === 0) continue;
    playerDPS += calculateDPS(tier.damage, tier.cooldown);
    totalInvested += tier.cost;
    damageTowerCount++;
  }

  const pathLength = computePathLength(map);
  const duration = getWaveDuration(wave, enemyData, difficulty, waveTable, pathLength);

  // Estimate purchasable DPS using average cost-per-DPS of placed towers.
  let purchasableDPS = 0;
  if (damageTowerCount > 0 && totalInvested > 0 && playerDPS > 0) {
    const avgCostPerDPS = totalInvested / playerDPS;
    const waveGoldReward = calculateWaveGoldReward(wave, enemyData, waveTable, 0);
    purchasableDPS = waveGoldReward / avgCostPerDPS;
  }

  // Balance check: waveHP <= duration * (playerDPS + k * purchasableDPS)
  const k = 1.2;
  const availableDPS = playerDPS + k * purchasableDPS;
  const passed = duration > 0 && waveHP <= duration * availableDPS;

  const details =
    `Wave ${wave} (${isBossWave(wave) ? 'boss' : 'normal'}): ` +
    `HP=${waveHP.toFixed(1)}, playerDPS=${playerDPS.toFixed(1)}, ` +
    `purchasableDPS=${purchasableDPS.toFixed(1)}, duration=${duration.toFixed(1)}s, ` +
    `k=${k}, available=${availableDPS.toFixed(1)} DPS, ` +
    `required=${(duration > 0 ? waveHP / duration : Infinity).toFixed(1)} DPS, ` +
    `passed=${passed}`;

  return { passed, waveHP, playerDPS, purchasableDPS, duration, details };
}

