import type { DifficultyMode } from './types';

export function applyDifficultyHP(baseHP: number, difficulty: DifficultyMode): number {
  return baseHP * difficulty.hpMultiplier;
}

export function getScalingRate(difficulty: DifficultyMode): number {
  return difficulty.hpScalingRate;
}

export function getStartingGold(difficulty: DifficultyMode): number {
  return difficulty.startingGold;
}

export function getStartingLives(difficulty: DifficultyMode): number {
  return difficulty.startingLives;
}

