import type { EnemyData, DifficultyMode, SlowEffect, DoTEffect, RuntimeEnemy } from '../logic/types';
import { scaleHP, getBossHPMultiplier } from '../logic/wave-scaling';
import { applyDifficultyHP } from '../logic/difficulty';
import { applyArmor, getEffectiveSpeed } from '../logic/damage';
import type { Path } from '../maps/path';

export type EnemyStatus = 'alive' | 'dead' | 'leaked';

let enemyIdCounter = 0;

/**
 * A runtime enemy instance spawned during a wave.
 * Encapsulates HP (difficulty-scaled), path following, damage resolution,
 * and slow-effect management. Position is derived from pathProgress via
 * the Path's getPositionAtDistance method.
 */
export class Enemy implements RuntimeEnemy {
  readonly id: string;
  readonly archetype: string;
  hp: number;
  readonly maxHP: number;
  readonly speed: number;
  currentSpeed: number;
  readonly armor: number;
  readonly flying: boolean;
  readonly isBoss: boolean;
  readonly goldReward: number;
  readonly pathId: string;
  pathProgress: number;
  x: number;
  y: number;
  status: EnemyStatus;
  activeSlowEffects: SlowEffect[];
  activeDoTEffects: DoTEffect[];
  rewardClaimed: boolean;

  constructor(
    enemyData: EnemyData,
    waveNumber: number,
    difficulty: DifficultyMode,
    pathId: string,
  ) {
    const logic = enemyData.logic;

    // HP: wave scaling → difficulty multiplier → boss multiplier
    const scaledHP = scaleHP(logic.baseHP, waveNumber, difficulty.hpScalingRate);
    const difficultyHP = applyDifficultyHP(scaledHP, difficulty);
    const bossMultiplier = logic.isBoss ? getBossHPMultiplier() : 1;
    const finalHP = difficultyHP * bossMultiplier;

    this.id = `enemy_${enemyIdCounter++}`;
    this.archetype = enemyData.archetype;
    this.hp = finalHP;
    this.maxHP = finalHP;
    this.speed = logic.speed;
    this.currentSpeed = logic.speed;
    this.armor = logic.armor ?? 0;
    this.flying = logic.flying;
    this.isBoss = logic.isBoss;
    this.goldReward = logic.goldReward;
    this.pathId = pathId;
    this.pathProgress = 0;
    this.x = 0;
    this.y = 0;
    this.status = 'alive';
    this.activeSlowEffects = [];
    this.activeDoTEffects = [];
    this.rewardClaimed = false;
  }

  /**
   * Advance the enemy along the path by currentSpeed * dt.
 * Decrements active slow effects and updates position.
   * Sets status to 'leaked' when the enemy reaches the end of the path.
   */
  update(dt: number, path: Path): void {
    if (this.status !== 'alive') return;

    // Expire slow effects before moving
    if (this.activeSlowEffects.length > 0) {
      this.activeSlowEffects = this.activeSlowEffects
        .map((effect) => ({ ...effect, duration: effect.duration - dt }))
        .filter((effect) => effect.duration > 0);
      this.currentSpeed = getEffectiveSpeed(this.speed, this.activeSlowEffects);
    }

    const totalLength = path.getTotalLength();
    if (totalLength <= 0) return;

    // Advance pathProgress: distance = currentSpeed * dt
    this.pathProgress += (this.currentSpeed * dt) / totalLength;

    if (this.pathProgress >= 1.0) {
      this.pathProgress = 1.0;
      this.status = 'leaked';
      const endPos = path.getPositionAtDistance(totalLength);
      this.x = endPos.x;
      this.y = endPos.y;
      return;
    }

    // Sync world position from path
    const pos = path.getPositionAtDistance(this.pathProgress * totalLength);
    this.x = pos.x;
    this.y = pos.y;
  }

  /**
   * Apply damage to the enemy, accounting for armor unless armor-piercing.
   * Sets status to 'dead' when HP reaches zero.
   */
  takeDamage(damage: number, isArmorPiercing: boolean): void {
    if (this.status !== 'alive') return;

    const effectiveDamage = applyArmor(damage, this.armor, isArmorPiercing);
    this.hp -= effectiveDamage;

    if (this.hp <= 0) {
      this.hp = 0;
      this.status = 'dead';
    }
  }

  /**
   * Add a slow effect and immediately recalculate currentSpeed.
   * The strongest slow (lowest factor) wins — effects do not stack.
   */
  applySlow(factor: number, duration: number): void {
    if (this.status !== 'alive') return;

    this.activeSlowEffects.push({ factor, duration });
    this.currentSpeed = getEffectiveSpeed(this.speed, this.activeSlowEffects);
  }

  /** Gold awarded when this enemy is killed. */
  getGoldReward(): number {
    return this.goldReward;
  }
}

