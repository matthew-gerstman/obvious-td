import type { EnemyData, DifficultyMode, WaveTable } from '../logic/types';
import { isBossWave } from '../logic/wave-scaling';
import { Enemy } from '../enemies/enemy';
import type { GameMap } from '../maps/map-loader';

export type WaveState = 'idle' | 'spawning' | 'active' | 'complete';

interface SpawnQueueEntry {
  enemyType: string;
  spawnTime: number;
  count: number;
  interval: number;
  spawnedCount: number;
}

interface WaveContext {
  enemyData: Record<string, EnemyData>;
  difficulty: DifficultyMode;
  waveNumber: number;
}

/**
 * Manages the lifecycle of a single wave: idle -> spawning -> active -> complete.
 * Builds a timed spawn queue from the wave table, spawns enemies at the correct
 * intervals, advances them along their assigned paths, and removes dead/leaked
 * enemies each tick.
 */
export class WaveRunner {
  private state: WaveState = 'idle';
  private enemies: Enemy[] = [];
  private spawnQueue: SpawnQueueEntry[] = [];
  private elapsedTime: number = 0;
  private pathAssignIndex: number = 0;
  private bossTelegraphActive: boolean = false;
  private context: WaveContext | null = null;
  private totalSpawned: number = 0;

  /**
   * Load a wave definition and build the spawn queue.
   * Sets the boss telegraph flag if the wave is a boss wave.
   */
  startWave(
    waveNumber: number,
    waveTable: WaveTable,
    enemyData: Record<string, EnemyData>,
    difficulty: DifficultyMode,
    map: GameMap,
  ): void {
    const waveEntry = waveTable.waves.find((w) => w.wave === waveNumber);
    if (!waveEntry) {
      this.reset();
      this.state = 'complete';
      return;
    }

    this.reset();
    this.context = { enemyData, difficulty, waveNumber };
    this.state = 'spawning';

    if (isBossWave(waveNumber)) {
      this.bossTelegraphActive = true;
    }

    // Build spawn queue — groups are sequential, each enemy spawns at
    // spawnTime + i * interval within its group.
    let cumulativeTime = 0;
    for (const entry of waveEntry.enemies) {
      const data = enemyData[entry.enemyId];
      if (!data) continue;

      const spawnMultiplier = data.logic.spawnCount ?? 1;
      const actualCount = entry.count * spawnMultiplier;

      this.spawnQueue.push({
        enemyType: entry.enemyId,
        spawnTime: cumulativeTime,
        count: actualCount,
        interval: entry.interval,
        spawnedCount: 0,
      });

      cumulativeTime += actualCount * entry.interval;
    }

    if (this.spawnQueue.length === 0) {
      this.state = 'complete';
    }

    // Validate map has start points for path assignment
    void map.startPoints.length;
  }

  /**
   * Advance the wave by dt seconds: spawn due enemies, update alive ones,
   * and remove dead/leaked enemies. Transitions state as appropriate.
   */
  update(dt: number, map: GameMap): void {
    if (this.state === 'idle' || this.state === 'complete') return;
    if (!this.context) return;

    const { enemyData, difficulty, waveNumber } = this.context;
    this.elapsedTime += dt;

    // Spawn enemies whose individual spawn time has arrived
    const remainingQueue: SpawnQueueEntry[] = [];
    for (const entry of this.spawnQueue) {
      while (
        entry.spawnedCount < entry.count &&
        this.elapsedTime >= entry.spawnTime + entry.spawnedCount * entry.interval
      ) {
        const data = enemyData[entry.enemyType];
        if (data) {
          const pathId = this.assignPath(map);
          const enemy = new Enemy(data, waveNumber, difficulty, pathId);
          const path = map.paths.find((p) => p.id === pathId);
          if (path) {
            const pos = path.getPositionAtDistance(0);
            enemy.x = pos.x;
            enemy.y = pos.y;
          }
          this.enemies.push(enemy);
          this.totalSpawned++;
        }
        entry.spawnedCount++;
      }

      if (entry.spawnedCount < entry.count) {
        remainingQueue.push(entry);
      }
    }
    this.spawnQueue = remainingQueue;

    // Update all alive enemies along their paths
    for (const enemy of this.enemies) {
      if (enemy.status !== 'alive') continue;
      const path = map.paths.find((p) => p.id === enemy.pathId);
      if (path) {
        enemy.update(dt, path);
      }
    }

    // Advance death fade-out for dead enemies still visually present
    for (const enemy of this.enemies) {
      if (enemy.status === 'dead' && enemy.fadeTimer > 0) {
        enemy.updateFade(dt);
      }
    }

    // Remove leaked enemies and dead enemies whose fade has completed
    this.enemies = this.enemies.filter(
      (e) => e.status === 'alive' || (e.status === 'dead' && e.fadeTimer > 0),
    );

    // State transitions
    if (this.spawnQueue.length === 0) {
      this.state = this.enemies.length === 0 ? 'complete' : 'active';
    }
  }

  /** All enemies currently alive on the map. */
  getAliveEnemies(): Enemy[] {
    return this.enemies.filter((e) => e.status === 'alive');
  }

  /** Dead enemies still fading out visually (for rendering only). */
  getFadingEnemies(): Enemy[] {
    return this.enemies.filter((e) => e.status === 'dead' && e.fadeTimer > 0);
  }

  /** True when the spawn queue is exhausted and no alive enemies remain. */
  isWaveComplete(): boolean {
    return this.state === 'complete';
  }

  /** Current wave lifecycle state. */
  getWaveState(): WaveState {
    return this.state;
  }

  /** True when a boss wave was started and the telegraph flag is active. */
  isBossTelegraphActive(): boolean {
    return this.bossTelegraphActive;
  }

  /** Total enemies spawned so far in the current wave. */
  getSpawnedCount(): number {
    return this.totalSpawned;
  }

  /** Reset all wave state for a new startWave call. */
  private reset(): void {
    this.enemies = [];
    this.spawnQueue = [];
    this.elapsedTime = 0;
    this.pathAssignIndex = 0;
    this.bossTelegraphActive = false;
    this.totalSpawned = 0;
  }

  /** Assign the next path in round-robin order from the map's start points. */
  private assignPath(map: GameMap): string {
    const startPoints = map.startPoints;
    if (startPoints.length === 0) {
      throw new Error('Map has no start points');
    }
    const sp = startPoints[this.pathAssignIndex % startPoints.length];
    if (!sp) throw new Error('Start point lookup failed');
    this.pathAssignIndex++;
    return sp.pathId;
  }
}
