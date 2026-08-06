import type { DifficultyMode } from '../logic/types';
import { calculateIncome } from '../logic/economy';
import type { Tower } from '../towers/tower';

/** Minimal enemy interface for kill rewards. */
export interface EnemyReward {
  goldReward: number;
}

/**
 * Tracks gold, lives, and wave state.
 * Processes enemy kills, wave-clear bonuses, and economy tower income.
 */
export class EconomyManager {
  private gold = 0;
  private lives = 0;
  private waveNumber = 0;

  /** Sets starting gold and lives from the difficulty config. */
  initialize(difficulty: DifficultyMode): void {
    this.gold = difficulty.startingGold;
    this.lives = difficulty.startingLives;
    this.waveNumber = 0;
  }

  addGold(amount: number): void {
    this.gold += amount;
  }

  /** Returns false if insufficient gold. */
  spendGold(amount: number): boolean {
    if (this.gold < amount) return false;
    this.gold -= amount;
    return true;
  }

  getGold(): number {
    return this.gold;
  }

  loseLife(): void {
    if (this.lives > 0) this.lives--;
  }

  getLives(): number {
    return this.lives;
  }

  getWaveNumber(): number {
    return this.waveNumber;
  }

  setWaveNumber(wave: number): void {
    this.waveNumber = wave;
  }

  /** Adds the enemy's gold reward to the player's gold. */
  processEnemyKill(enemy: EnemyReward): void {
    this.gold += enemy.goldReward;
  }

  /** Adds a wave-clear bonus: 20 + wave * 5. */
  processWaveClear(waveNumber: number): void {
    this.waveNumber = waveNumber;
    const bonus = 20 + waveNumber * 5;
    this.gold += bonus;
  }

  /**
   * Processes passive income for economy towers.
   * Accumulates elapsed time on each tower's cooldownTimer and pays out
   * using WI-2's calculateIncome when enough time has passed.
   */
  processEconomyIncome(towers: Tower[], dt: number): void {
    for (const tower of towers) {
      const stats = tower.getStats();
      if (stats.incomePerTick === undefined || stats.incomeInterval === undefined) continue;

      tower.cooldownTimer += dt;

      // Use WI-2's calculateIncome to determine payouts for accumulated time.
      // We pass elapsedTicks=1 and tickDuration=cooldownTimer so that
      // totalSeconds = cooldownTimer, giving floor(cooldownTimer / incomeInterval) payouts.
      const income = calculateIncome(
        stats.incomePerTick,
        stats.incomeInterval,
        1,
        tower.cooldownTimer,
      );

      if (income > 0) {
        this.addGold(income);
        // Keep remainder toward the next payout
        const numPayouts = Math.floor(tower.cooldownTimer / stats.incomeInterval);
        tower.cooldownTimer -= numPayouts * stats.incomeInterval;
      }
    }
  }
}
