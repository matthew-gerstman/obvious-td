// Shared types for the pure game-logic core.
// All types mirror the JSON data schemas in schemas/ and data files in data/.

export interface EnemyLogic {
  baseHP: number;
  speed: number;
  armor?: number;
  flying: boolean;
  spawnCount?: number;
  goldReward: number;
  isBoss: boolean;
}

export interface EnemyPresentation {
  name: string;
  description: string;
  sprite: string;
}

export interface EnemyData {
  id: string;
  type: 'enemy';
  archetype: string;
  logic: EnemyLogic;
  presentation?: EnemyPresentation;
}

export interface TowerTier {
  tier: number;
  cost: number;
  damage: number;
  cooldown: number;
  range: number;
  targeting: string;
  hitsAir: boolean;
  armorPiercing: boolean;
  splashRadius?: number;
  slowFactor?: number;
  slowDuration?: number;
  dotDamage?: number;
  dotDuration?: number;
  dotTicks?: number;
  auraRadius?: number;
  auraBuffs?: {
    damageMultiplier: number;
    rangeMultiplier: number;
    fireRateMultiplier: number;
  };
  incomePerTick?: number;
  incomeInterval?: number;
}

export interface TowerPresentation {
  name: string;
  description: string;
  sprite: string;
  projectileSprite?: string;
}

export interface TowerData {
  id: string;
  type: 'tower';
  archetype: string;
  logic: { tiers: TowerTier[] };
  presentation?: TowerPresentation;
}

export interface DifficultyMode {
  hpMultiplier: number;
  hpScalingRate: number;
  startingGold: number;
  startingLives: number;
}

export interface DifficultyConfig {
  modes: {
    easy: DifficultyMode;
    medium: DifficultyMode;
    hard: DifficultyMode;
  };
}

export interface WaveEnemyEntry {
  enemyId: string;
  count: number;
  interval: number;
}

export interface Wave {
  wave: number;
  enemies: WaveEnemyEntry[];
}

export interface WaveTable {
  id: string;
  waves: Wave[];
}

export interface MapData {
  id: string;
  type: 'map';
  logic: {
    width: number;
    height: number;
    paths: Array<{ id: string; waypoints: Array<{ x: number; y: number }> }>;
    buildableTiles: Array<{ x: number; y: number }>;
    startPoints: Array<{ x: number; y: number; pathId: string }>;
    endPoint: { x: number; y: number };
  };
}

// Runtime enemy state (used by targeting and splash calculations).
export interface RuntimeEnemy {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHP: number;
  speed: number;
  flying: boolean;
  pathProgress: number;
  armor: number;
}

export interface SlowEffect {
  factor: number;
  duration: number;
}

export interface DoTEffect {
  dotDamage: number;
  remainingTicks: number;
  tickInterval: number;
  tickTimer: number;
}

export type TargetingMode = 'first' | 'last' | 'strong' | 'close';

// A tower placed on the map (used by balance gate).
export interface PlacedTower {
  towerData: TowerData;
  tier: number;
  x: number;
  y: number;
}

export interface BalanceResult {
  passed: boolean;
  waveHP: number;
  playerDPS: number;
  purchasableDPS: number;
  duration: number;
  details: string;
}

