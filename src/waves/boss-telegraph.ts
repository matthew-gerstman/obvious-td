import { isBossWave } from '../logic/wave-scaling';

/**
 * Tracks whether a boss-wave warning has been shown for each wave.
 * The game shell (WI-9) renders the banner; this module only manages state.
 */
export class BossTelegraph {
  private shownWaves: Set<number> = new Set();

  /**
   * Returns true if nextWave is a boss wave and the telegraph
   * has not yet been shown for it.
   */
  shouldTelegraph(_currentWave: number, nextWave: number): boolean {
    return isBossWave(nextWave) && !this.shownWaves.has(nextWave);
  }

  /** Warning string for the upcoming boss wave. */
  getTelegraphMessage(waveNumber: number): string {
    return `\u26a0 BOSS WAVE INCOMING \u2014 Wave ${waveNumber}`;
  }

  /** Mark the telegraph as shown for the given wave. */
  markShown(waveNumber: number): void {
    this.shownWaves.add(waveNumber);
  }
}

