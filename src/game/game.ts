import { Renderer } from '../renderer/renderer';
import { SpriteCache } from '../renderer/sprite-loader';
import { GameLoop } from '../engine/game-loop';
import { InputManager } from '../input/input-manager';
import type { TilePoint } from '../input/coordinates';
import { loadMap, type GameMap } from '../maps/map-loader';
import { renderMap } from '../maps/map-renderer';
import { TowerManager } from '../towers/tower-manager';
import { TowerUI, TOWER_COLORS } from '../towers/tower-ui';
import { ThemeManager } from './theme-manager';
import { EconomyManager } from '../economy/economy-manager';
import { WaveRunner } from '../waves/wave-runner';
import { BossTelegraph } from '../waves/boss-telegraph';
import { CombatManager } from '../combat/combat-manager';
import { ProjectileManager } from '../combat/projectile';
import { MuzzleFlashManager } from '../combat/muzzle-flash';
import type { TowerData, DifficultyMode, EnemyData, WaveTable, ThemeData, ThemeOption } from '../logic/types';
import { GameStateMachine, type GameState, type DifficultyKey } from './game-state';
import { TitleScreen } from './screens/title-screen';
import { ResultScreen, type ResultStats } from './screens/result-screen';
import { HUD, type HUDContext } from './hud';
import {
  analyzeWave,
  renderStrategyHints,
  type StrategyHintResult,
  type PlacedTowerInfo,
} from './strategy-hints';
import { DamageNumberManager } from './damage-numbers';
import { drawHealthBar, drawStatusTint } from './enemy-visuals';

const TILE_SIZE = 32;
const MAP_WIDTH = 20;
const MAP_HEIGHT = 15;
const TOTAL_WAVES = 30;
const AUTO_START_DELAY = 10; // seconds

const TOWER_FILES = ['gatling', 'cannon', 'frost', 'poison', 'sniper', 'aura', 'economy'];
const ENEMY_FILES = ['grunt', 'runner', 'armored', 'flyer', 'swarm', 'boss'];
const MAP_FILES = ['map_single_path', 'map_multi_path', 'map_branching'];

const AVAILABLE_THEMES: ThemeOption[] = [
  { id: 'demons-heaven', name: 'Demons Into Heaven' },
  { id: 'dragon-ball', name: 'Dragon Ball Z' },
];

interface DifficultyConfigData {
  modes: { easy: DifficultyMode; medium: DifficultyMode; hard: DifficultyMode };
}

/**
 * Main game orchestrator. Wires all WI-3 through WI-8 systems into a
 * playable game with title -> play -> result flow.
 */
export class Game {
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private inputManager: InputManager;
  private gameLoop: GameLoop;
  private stateMachine: GameStateMachine;
  private titleScreen: TitleScreen;
  private hud: HUD;
  private resultScreen: ResultScreen;
  private bossTelegraph: BossTelegraph;

  // Loaded data
  private towerArchetypes: TowerData[] = [];
  private enemyArchetypes: Record<string, EnemyData> = {};
  private waveTable: WaveTable | null = null;
  private difficultyConfigs: DifficultyConfigData | null = null;
  private mapDataCache: Record<string, object> = {};
  private dataLoaded = false;

  // Game systems
  private gameMap: GameMap | null = null;
  private economyManager: EconomyManager | null = null;
  private towerManager: TowerManager | null = null;
  private towerUI: TowerUI | null = null;
  private waveRunner: WaveRunner | null = null;
  private combatManager: CombatManager | null = null;
  private projectileManager: ProjectileManager | null = null;
  private muzzleFlashManager: MuzzleFlashManager | null = null;
  private spriteCache: SpriteCache = new SpriteCache();
  private damageNumberManager: DamageNumberManager = new DamageNumberManager();
  private themeManager = new ThemeManager();
  private themeData: ThemeData | null = null;
  private currentThemeId = 'demons-heaven';
  private rawTowerArchetypes: TowerData[] = [];
  private rawEnemyArchetypes: Record<string, EnemyData> = {};
  private currentTowerColors: Record<string, string> = {};

  // Runtime state
  private currentDifficulty: DifficultyMode | null = null;
  private currentWave = 0;
  private speedMultiplier = 1;
  private prepTimer = 0;
  private totalEnemiesKilled = 0;
  private paused = false;
  private autoStartEnabled = true;
  private currentStrategyHints: StrategyHintResult | null = null;

  // Input state for E2E test hooks
  private inputState = {
    lastTap: null as TilePoint | null,
    lastHover: null as TilePoint | null,
    lastDragStart: null as TilePoint | null,
    lastDragMove: null as TilePoint | null,
    lastDragEnd: null as TilePoint | null,
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas, {
      tileSize: TILE_SIZE,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
    });

    this.stateMachine = new GameStateMachine();
    this.bossTelegraph = new BossTelegraph();

    // Screens — callbacks wired after construction
    this.titleScreen = new TitleScreen();
    this.hud = new HUD();
    this.resultScreen = new ResultScreen();

    this.titleScreen.setOnStart(() => this.handleStartClick());
    this.hud.setOnStartWave(() => this.startWave());
    this.hud.setOnToggleSpeed(() => this.toggleSpeed());
    this.hud.setOnTogglePause(() => this.togglePause());
    this.hud.setOnToggleAutoStart(() => this.toggleAutoStart());
    this.resultScreen.setOnReturn(() => this.returnToTitle());
    this.titleScreen.setOnThemeSelect((themeId) => this.handleThemeSelect(themeId));

    // Input — tile taps routed by state
    this.inputManager = new InputManager(canvas, TILE_SIZE, {
      onTileTap: (tile) => {
        this.inputState.lastTap = tile;
        this.handleTileTap(tile);
      },
      onTileHover: (tile) => {
        this.inputState.lastHover = tile;
        this.towerUI?.setHoverTile(tile);
      },
      onTileDragStart: (tile) => { this.inputState.lastDragStart = tile; },
      onTileDragMove: (tile) => { this.inputState.lastDragMove = tile; },
      onTileDragEnd: (tile) => { this.inputState.lastDragEnd = tile; },
    });

    // Game loop — update and render callbacks
    this.gameLoop = new GameLoop(this.update, this.render);

    // Expose immediate hooks (game loop + input state available before data loads)
    this.exposeImmediateHooks();

    // Start loading data and the render loop
    void this.init();
    this.gameLoop.start();
  }

  // ── Public API ──────────────────────────────────────────────────

  getState(): GameState {
    return this.stateMachine.getState();
  }

  getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  getCurrentWave(): number {
    return this.currentWave;
  }

  isDataLoaded(): boolean {
    return this.dataLoaded;
  }

  /**
   * Starts a new game with the given difficulty and map.
   * Only valid from TITLE state. Returns false if data isn't loaded
   * or the state is not TITLE.
   */
  start(difficulty: DifficultyKey, mapId: string): boolean {
    if (!this.dataLoaded || this.stateMachine.getState() !== 'TITLE') return false;

    const mapData = this.mapDataCache[mapId];
    if (!mapData) return false;

    const diffConfig = this.difficultyConfigs?.modes[difficulty];
    if (!diffConfig) return false;

    this.gameMap = loadMap(mapData);
    this.currentDifficulty = diffConfig;

    this.economyManager = new EconomyManager();
    this.economyManager.initialize(diffConfig);

    this.towerManager = new TowerManager(this.gameMap);
    this.towerUI = new TowerUI(
      this.renderer,
      this.towerManager,
      this.economyManager,
      this.towerArchetypes,
      TILE_SIZE,
      this.gameMap.width,
      this.spriteCache,
    );
    this.towerUI.setTheme(this.themeData?.ui?.towerUI ?? null);

    this.waveRunner = new WaveRunner();
    this.projectileManager = new ProjectileManager();
    this.muzzleFlashManager = new MuzzleFlashManager();
    this.combatManager = new CombatManager(
      this.economyManager,
      this.projectileManager,
      this.muzzleFlashManager,
    );

    this.currentWave = 0;
    this.speedMultiplier = 1;
    this.prepTimer = 0;
    this.totalEnemiesKilled = 0;
    this.paused = false;
    this.autoStartEnabled = true;
    this.currentStrategyHints = null;
    this.damageNumberManager.clear();
    this.gameLoop.setSpeed(1);

    this.bossTelegraph = new BossTelegraph();

    this.stateMachine.reset();
    this.stateMachine.transitionTo('WAVE_PREP', `Started ${difficulty} on ${mapId}`);

    this.exposeSystemHooks();
    return true;
  }

  /**
   * Starts the next wave. Only valid from WAVE_PREP.
   * Transitions to WAVE_ACTIVE.
   */
  startWave(): void {
    if (this.stateMachine.getState() !== 'WAVE_PREP') return;
    if (!this.waveTable || !this.gameMap || !this.currentDifficulty) return;
    if (!this.waveRunner || !this.economyManager) return;

    this.currentWave++;
    this.currentStrategyHints = null;
    this.economyManager.setWaveNumber(this.currentWave);

    this.waveRunner.startWave(
      this.currentWave,
      this.waveTable,
      this.enemyArchetypes,
      this.currentDifficulty,
      this.gameMap,
    );

    this.bossTelegraph.markShown(this.currentWave);

    this.stateMachine.transitionTo('WAVE_ACTIVE', `Wave ${this.currentWave} started`);
    this.prepTimer = 0;
  }

  /** Returns to the title screen from VICTORY or DEFEAT. */
  returnToTitle(): void {
    const state = this.stateMachine.getState();
    if (state !== 'VICTORY' && state !== 'DEFEAT') return;

    this.stateMachine.transitionTo('TITLE', 'Player returned to title');
    this.titleScreen.selectedDifficulty = null;
    this.titleScreen.selectedMapId = null;
    this.prepTimer = 0;
    this.speedMultiplier = 1;
    this.paused = false;
    this.autoStartEnabled = true;
    this.currentStrategyHints = null;
    this.gameLoop.setSpeed(1);
  }

  /** Toggles between 1x and 2x speed. */
  toggleSpeed(): void {
    if (this.paused) return;
    this.speedMultiplier = this.speedMultiplier === 1 ? 2 : 1;
    this.gameLoop.setSpeed(this.speedMultiplier);
  }

  /** Toggles pause on/off. */
  togglePause(): void {
    this.paused = !this.paused;
  }

  /** Returns true if the game is paused. */
  isPaused(): boolean {
    return this.paused;
  }

  /** Toggles auto-start on/off. */
  toggleAutoStart(): void {
    this.autoStartEnabled = !this.autoStartEnabled;
    // Reset prep timer so a turning-off-then-on doesn't fire immediately
    if (!this.autoStartEnabled) {
      this.prepTimer = 0;
    }
  }

  /** Returns true if auto-start is enabled. */
  isAutoStartEnabled(): boolean {
    return this.autoStartEnabled;
  }

  /** Returns the current prep timer value (seconds elapsed in WAVE_PREP). */
  getPrepTimer(): number {
    return this.prepTimer;
  }

  /** Returns strategy hints for the upcoming wave, or null outside WAVE_PREP. */
  getStrategyHints(): StrategyHintResult | null {
    if (this.stateMachine.getState() !== 'WAVE_PREP') return null;
    return this.computeStrategyHints();
  }

  /** Clean up event listeners. */
  destroy(): void {
    this.gameLoop.stop();
    this.inputManager.destroy();
    this.renderer.destroy();
  }

  // ── Update / Render ─────────────────────────────────────────────

  private update = (dt: number): void => {
    const state = this.stateMachine.getState();

    if (state === 'TITLE' || state === 'VICTORY' || state === 'DEFEAT') return;
    if (this.paused) return;

    if (state === 'WAVE_PREP') {
      this.updateWavePrep(dt);
    } else if (state === 'WAVE_ACTIVE') {
      this.updateWaveActive(dt);
    }
  };

  private render = (_alpha: number): void => {
    this.renderer.clear();

    const state = this.stateMachine.getState();

    if (state === 'TITLE') {
      this.titleScreen.render(this.renderer);
    } else if (state === 'WAVE_PREP' || state === 'WAVE_ACTIVE') {
      this.renderGame();
    } else if (state === 'VICTORY') {
      this.resultScreen.render(this.renderer, 'victory', this.getResultStats());
    } else if (state === 'DEFEAT') {
      this.resultScreen.render(this.renderer, 'defeat', this.getResultStats());
    }
  };

  // ── State-specific updates ──────────────────────────────────────

  private updateWavePrep(dt: number): void {
    if (this.economyManager && this.towerManager) {
      this.economyManager.processEconomyIncome(
        this.towerManager.getAllTowers(),
        dt,
      );
    }

    // Auto-start countdown only for waves 2+ when auto-start is enabled.
    // Wave 1 (currentWave === 0) always requires manual Start Wave.
    if (this.autoStartEnabled && this.currentWave >= 1) {
      this.prepTimer += dt;
      if (this.prepTimer >= AUTO_START_DELAY && this.currentWave < TOTAL_WAVES) {
        this.startWave();
      }
    }
  }

  private updateWaveActive(dt: number): void {
    if (!this.waveRunner || !this.gameMap || !this.combatManager || !this.economyManager) return;
    if (!this.towerManager) return;

    // Economy income ticks during active waves too
    this.economyManager.processEconomyIncome(
      this.towerManager.getAllTowers(),
      dt,
    );

    // Capture alive enemies before wave update for leak detection
    const enemiesBeforeUpdate = this.waveRunner.getAliveEnemies();

    // Wave runner: spawn + move enemies
    this.waveRunner.update(dt, this.gameMap);

    // Detect leaked enemies and deduct lives
    for (const enemy of enemiesBeforeUpdate) {
      if (enemy.status === 'leaked') {
        this.economyManager.loseLife();
      }
    }

    // Combat: towers fire, DoTs tick, slows expire, deaths processed
    const aliveEnemies = this.waveRunner.getAliveEnemies();

    // Capture HP before combat to detect damage for floating numbers
    const hpBefore = new Map<string, number>();
    for (const enemy of aliveEnemies) {
      hpBefore.set(enemy.id, enemy.hp);
    }

    this.combatManager.update(dt, this.towerManager.getAllTowers(), aliveEnemies);

    // Spawn floating damage numbers for enemies that lost HP
    for (const enemy of aliveEnemies) {
      const before = hpBefore.get(enemy.id);
      if (before !== undefined && enemy.hp < before) {
        this.damageNumberManager.spawn(enemy.x, enemy.y, before - enemy.hp);
      }
    }

    // Update floating damage numbers
    this.damageNumberManager.update(dt);

    // Muzzle flash timers advance with combat
    this.muzzleFlashManager?.update(dt);

    // Count newly killed enemies for defeat-screen stats
    for (const enemy of aliveEnemies) {
      if (enemy.status === 'dead') {
        this.totalEnemiesKilled++;
      }
    }

    // Check defeat
    if (this.economyManager.getLives() <= 0) {
      this.stateMachine.transitionTo('DEFEAT', 'All lives lost');
      return;
    }

    // Check wave complete
    if (this.waveRunner.isWaveComplete()) {
      this.economyManager.processWaveClear(this.currentWave);
      if (this.currentWave >= TOTAL_WAVES) {
        this.stateMachine.transitionTo('VICTORY', 'All 30 waves completed');
      } else {
        this.stateMachine.transitionTo('WAVE_PREP', `Wave ${this.currentWave} completed`);
        this.prepTimer = 0;
      }
    }
  }

  // ── Rendering ───────────────────────────────────────────────────

  private renderGame(): void {
    if (!this.gameMap) return;

    const pathTileDir = this.themeData?.ui?.pathTiles?.spriteDir;
    renderMap(this.renderer, this.gameMap, {
      showBuildable: true,
      tileSize: TILE_SIZE,
      spriteCache: this.spriteCache,
      ...(pathTileDir ? { pathTileDir } : {}),
    });

    // Towers — sprite with tier-based scale and brightness, fallback to drawRect
    if (this.towerManager) {
      const tierScale = [1.0, 1.15, 1.3];
      const tierBrightness = ['none', 'brightness(1.15)', 'brightness(1.3)'];

      for (const tower of this.towerManager.getAllTowers()) {
        const spritePath = tower.archetype.presentation?.sprite;
        const sprite = spritePath ? this.spriteCache.get(spritePath) : null;

        if (sprite) {
          const scale = tierScale[tower.tier - 1] ?? 1.0;
          const brightness = tierBrightness[tower.tier - 1] ?? 'none';
          const size = TILE_SIZE * scale;
          const offset = (TILE_SIZE - size) / 2;

          this.renderer.save();
          if (brightness !== 'none') this.renderer.setFilter(brightness);
          this.renderer.drawSprite(
            sprite,
            tower.tileX * TILE_SIZE + offset,
            tower.tileY * TILE_SIZE + offset,
            size,
            size,
          );
          this.renderer.restore();
        } else {
          const color = this.currentTowerColors[tower.archetype.archetype] ?? TOWER_COLORS[tower.archetype.archetype] ?? '#888';
          const inset = 4;
          this.renderer.drawRect(
            tower.tileX * TILE_SIZE + inset,
            tower.tileY * TILE_SIZE + inset,
            TILE_SIZE - inset * 2,
            TILE_SIZE - inset * 2,
            color,
          );
        }

        // Tier indicator dots (always drawn on top)
        for (let i = 0; i < tower.tier; i++) {
          this.renderer.drawRect(
            tower.tileX * TILE_SIZE + 6 + i * 8,
            tower.tileY * TILE_SIZE + TILE_SIZE - 8,
            4,
            4,
            '#fff',
          );
        }
      }
    }

    // Enemies — alive: sprite + status tint + health bar
    if (this.waveRunner) {
      for (const enemy of this.waveRunner.getAliveEnemies()) {
        const sprite = enemy.spritePath ? this.spriteCache.get(enemy.spritePath) : null;

        if (sprite) {
          const size = enemy.isBoss ? TILE_SIZE * 1.5 : TILE_SIZE - 4;
          const offset = (TILE_SIZE - size) / 2;
          this.renderer.drawSprite(
            sprite,
            enemy.x * TILE_SIZE + offset,
            enemy.y * TILE_SIZE + offset,
            size,
            size,
          );
        } else {
          const color = enemy.flying ? '#ff6b6b' : '#e03939';
          this.renderer.drawRect(
            enemy.x * TILE_SIZE + 8,
            enemy.y * TILE_SIZE + 8,
            TILE_SIZE - 16,
            TILE_SIZE - 16,
            color,
          );
        }

        // Status effect tint overlay (slow = blue, poison = green)
        drawStatusTint(this.renderer, enemy, TILE_SIZE);

        // Health bar above damaged enemies
        drawHealthBar(this.renderer, enemy, TILE_SIZE);
      }

      // Dead enemies — render with fade-out alpha
      for (const enemy of this.waveRunner.getFadingEnemies()) {
        this.renderer.save();
        this.renderer.setAlpha(enemy.fadeAlpha);

        const sprite = enemy.spritePath ? this.spriteCache.get(enemy.spritePath) : null;
        if (sprite) {
          const size = enemy.isBoss ? TILE_SIZE * 1.5 : TILE_SIZE - 4;
          const offset = (TILE_SIZE - size) / 2;
          this.renderer.drawSprite(
            sprite,
            enemy.x * TILE_SIZE + offset,
            enemy.y * TILE_SIZE + offset,
            size,
            size,
          );
        } else {
          const color = enemy.flying ? '#ff6b6b' : '#e03939';
          this.renderer.drawRect(
            enemy.x * TILE_SIZE + 8,
            enemy.y * TILE_SIZE + 8,
            TILE_SIZE - 16,
            TILE_SIZE - 16,
            color,
          );
        }

        this.renderer.restore();
      }

      // Floating damage numbers
      this.damageNumberManager.render(this.renderer, TILE_SIZE);
    }

    // Projectiles — sprite with fallback to drawRect
    if (this.projectileManager) {
      this.projectileManager.render(this.renderer, TILE_SIZE, this.spriteCache);
    }

    // Muzzle flashes — firing animation
    if (this.muzzleFlashManager) {
      this.muzzleFlashManager.render(this.renderer, TILE_SIZE);
    }

    // Strategy hints (WAVE_PREP only) — before tower UI so panels stay on top
    if (this.stateMachine.getState() === 'WAVE_PREP') {
      this.currentStrategyHints = this.computeStrategyHints();
      if (this.currentStrategyHints) {
        renderStrategyHints(this.renderer, this.currentStrategyHints);
      }
    }

    // Tower UI panels
    if (this.towerUI) {
      this.towerUI.render();
    }

    // HUD overlay
    this.hud.render(this.renderer, this.getHUDContext());
  }

  // ── Input routing ───────────────────────────────────────────────

  private handleTileTap(tile: TilePoint): void {
    const tapX = tile.x * TILE_SIZE + TILE_SIZE / 2;
    const tapY = tile.y * TILE_SIZE + TILE_SIZE / 2;

    const state = this.stateMachine.getState();

    if (state === 'TITLE') {
      this.titleScreen.handleClick(tapX, tapY);
    } else if (state === 'WAVE_PREP' || state === 'WAVE_ACTIVE') {
      const ctx = this.getHUDContext();
      if (this.hud.handleClick(tapX, tapY, ctx)) return;
      this.towerUI?.handleTileTap(tile);
    } else if (state === 'VICTORY' || state === 'DEFEAT') {
      this.resultScreen.handleClick(tapX, tapY);
    }
  }

  private handleStartClick(): void {
    if (!this.titleScreen.canStart()) return;
    this.start(
      this.titleScreen.selectedDifficulty!,
      this.titleScreen.selectedMapId!,
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private getHUDContext(): HUDContext {
    const state = this.stateMachine.getState();
    const inPrep = state === 'WAVE_PREP';
    const inActive = state === 'WAVE_ACTIVE';
    const preview = inPrep ? this.buildWavePreview() : null;

    // Countdown only shows for waves 2+ when auto-start is enabled
    const showCountdown = inPrep && this.autoStartEnabled && this.currentWave >= 1;
    const countdown = showCountdown
      ? Math.max(0, AUTO_START_DELAY - this.prepTimer)
      : null;

    return {
      gold: this.economyManager?.getGold() ?? 0,
      lives: this.economyManager?.getLives() ?? 0,
      waveNumber: this.currentWave,
      totalWaves: TOTAL_WAVES,
      showStartWave: inPrep,
      speedMultiplier: this.speedMultiplier,
      bossBannerText: this.getBossBannerText(),
      wavePreviewText: preview?.text ?? null,
      wavePreviewHasBoss: preview?.hasBoss ?? false,
      autoStartCountdown: countdown,
      autoStartEnabled: this.autoStartEnabled,
      showAutoStartToggle: inPrep,
      paused: this.paused,
      showPauseButton: inPrep || inActive,
    };
  }

  /**
   * Builds a human-readable preview of the next wave's composition.
   * Returns null if wave data isn't loaded or the next wave doesn't exist.
   */
  private buildWavePreview(): { text: string; hasBoss: boolean } | null {
    if (!this.waveTable || !this.enemyArchetypes) return null;
    const nextWave = this.currentWave + 1;
    const waveEntry = this.waveTable.waves.find((w) => w.wave === nextWave);
    if (!waveEntry) return null;

    const parts: string[] = [];
    let hasBoss = false;

    for (const entry of waveEntry.enemies) {
      const enemyData = this.enemyArchetypes[entry.enemyId];
      if (!enemyData) continue;

      const name = enemyData.presentation?.name ?? entry.enemyId;
      const count = entry.count;
      const isBoss = enemyData.logic.isBoss;
      if (isBoss) hasBoss = true;

      // Pluralize: add 's' for count > 1, but skip for boss and names ending in 'ed'
      const plural = count > 1 && !isBoss && !name.endsWith('ed')
        ? `${name}s`
        : name;
      parts.push(`${count} ${plural}`);
    }

    if (parts.length === 0) return null;
    return {
      text: `Next Wave ${nextWave}: ${parts.join(', ')}`,
      hasBoss,
    };
  }

  private getBossBannerText(): string | null {
    if (this.stateMachine.getState() !== 'WAVE_PREP') return null;
    const nextWave = this.currentWave + 1;
    if (this.bossTelegraph.shouldTelegraph(this.currentWave, nextWave)) {
      return this.bossTelegraph.getTelegraphMessage(nextWave);
    }
    return null;
  }

  /**
   * Computes strategy hints for the upcoming wave based on the player's
   * currently placed towers. Returns null if data isn't loaded yet.
   */
  private computeStrategyHints(): StrategyHintResult | null {
    if (!this.waveTable || Object.keys(this.enemyArchetypes).length === 0) return null;
    if (this.towerArchetypes.length === 0) return null;

    const nextWave = this.currentWave + 1;
    return analyzeWave(
      nextWave,
      this.waveTable,
      this.enemyArchetypes,
      this.towerArchetypes,
      this.getPlacedTowerInfo(),
    );
  }

  /** Extracts capability info from all placed towers for hint analysis. */
  private getPlacedTowerInfo(): PlacedTowerInfo[] {
    if (!this.towerManager) return [];
    return this.towerManager.getAllTowers().map((t) => ({
      hitsAir: t.getStats().hitsAir,
      armorPiercing: t.getStats().armorPiercing,
    }));
  }

  private getResultStats(): ResultStats {
    return {
      wavesSurvived: this.currentWave,
      goldRemaining: this.economyManager?.getGold() ?? 0,
      towersBuilt: this.towerManager?.getAllTowers().length ?? 0,
      waveReached: this.currentWave,
      enemiesKilled: this.totalEnemiesKilled,
    };
  }

  // ── Data loading ────────────────────────────────────────────────

  private async init(): Promise<void> {
    try {
      // Tower archetypes (raw, unthemed — overrides applied after theme load)
      this.rawTowerArchetypes = await Promise.all(
        TOWER_FILES.map(async (name) => {
          const res = await fetch(`/data/archetypes/tower_${name}.json`);
          return (await res.json()) as TowerData;
        }),
      );

      // Enemy archetypes (raw, unthemed)
      await Promise.all(
        ENEMY_FILES.map(async (name) => {
          const res = await fetch(`/data/archetypes/enemy_${name}.json`);
          const data = (await res.json()) as EnemyData;
          this.rawEnemyArchetypes[data.id] = data;
        }),
      );

      // Wave table
      const waveResponse = await fetch('/data/waves/wave_table.json');
      this.waveTable = (await waveResponse.json()) as WaveTable;

      // Difficulty configs
      const diffResponse = await fetch('/data/difficulty.json');
      this.difficultyConfigs =
        (await diffResponse.json()) as DifficultyConfigData;

      // All map data (pre-loaded so start() is synchronous)
      await Promise.all(
        MAP_FILES.map(async (id) => {
          const res = await fetch(`/data/maps/${id}.json`);
          this.mapDataCache[id] = await res.json();
        }),
      );

      // Load theme and apply overrides to archetype presentation
      this.currentThemeId = this.themeManager.loadSavedTheme();
      this.themeData = await this.themeManager.loadTheme(this.currentThemeId);
      await this.applyThemeData();

      // Create default systems for backward compatibility with existing tests
      this.createDefaultSystems();

      this.dataLoaded = true;
      this.exposeSystemHooks();
    } catch {
      // Data loading failed — game stays on title screen
      // which renders without requiring loaded data
    }
  }

  /** Apply theme overrides to archetype data, screens, and sprite cache. */
  private async applyThemeData(): Promise<void> {
    this.towerArchetypes = this.themeManager.applyOverrides(this.rawTowerArchetypes, this.themeData);

    const themedEnemies = this.themeManager.applyOverrides(
      Object.values(this.rawEnemyArchetypes),
      this.themeData,
    );
    this.enemyArchetypes = {};
    for (const enemy of themedEnemies) {
      this.enemyArchetypes[enemy.id] = enemy;
    }

    this.currentTowerColors = this.themeData?.ui?.towerUI?.towerColors ?? {};

    this.titleScreen.setThemeData(this.themeData, AVAILABLE_THEMES);
    this.titleScreen.selectedTheme = this.currentThemeId;
    this.hud.setTheme(this.themeData?.ui?.hud ?? null);
    this.resultScreen.setTheme(this.themeData?.ui?.result ?? null);
    if (this.towerUI) {
      this.towerUI.setTheme(this.themeData?.ui?.towerUI ?? null);
    }

    const spritePaths = this.themeManager.resolveSpritePaths(
      this.towerArchetypes,
      this.enemyArchetypes,
      this.themeData,
    );
    await this.spriteCache.preload(spritePaths);
  }

  /** Handle theme selector click — save, reload, and apply new theme. */
  private async handleThemeSelect(themeId: string): Promise<void> {
    this.themeManager.saveTheme(themeId);
    this.currentThemeId = themeId;
    this.themeData = await this.themeManager.loadTheme(themeId);
    await this.applyThemeData();
  }

  private createDefaultSystems(): void {
    const mapData = this.mapDataCache['map_single_path'];
    if (!mapData || !this.difficultyConfigs) return;

    this.gameMap = loadMap(mapData);
    this.currentDifficulty = this.difficultyConfigs.modes.easy;

    this.economyManager = new EconomyManager();
    this.economyManager.initialize(this.currentDifficulty);

    this.towerManager = new TowerManager(this.gameMap);
    this.towerUI = new TowerUI(
      this.renderer,
      this.towerManager,
      this.economyManager,
      this.towerArchetypes,
      TILE_SIZE,
      this.gameMap.width,
      this.spriteCache,
    );
    this.towerUI.setTheme(this.themeData?.ui?.towerUI ?? null);

    this.waveRunner = new WaveRunner();
    this.projectileManager = new ProjectileManager();
    this.muzzleFlashManager = new MuzzleFlashManager();
    this.combatManager = new CombatManager(
      this.economyManager,
      this.projectileManager,
      this.muzzleFlashManager,
    );
  }

  // ── Test hook exposure ──────────────────────────────────────────

  private exposeImmediateHooks(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__gameLoop = this.gameLoop;
    w.__inputTestHook = this.inputState;
    w.__titleScreen = this.titleScreen;
    w.__hud = this.hud;
    w.__resultScreen = this.resultScreen;
    w.__game = this;
    w.__startGame = (difficulty: string, mapId: string) =>
      this.start(difficulty as DifficultyKey, mapId);
  }

  private exposeSystemHooks(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__towerManager = this.towerManager;
    w.__economyManager = this.economyManager;
    w.__towerUI = this.towerUI;
    w.__gameMap = this.gameMap;
    w.__waveRunner = this.waveRunner;
    w.__combatManager = this.combatManager;
    w.__projectileManager = this.projectileManager;
    w.__muzzleFlashManager = this.muzzleFlashManager;
    w.__enemyArchetypes = this.enemyArchetypes;
    w.__towerArchetypes = this.towerArchetypes;
    w.__waveTable = this.waveTable;
    w.__difficulty = this.currentDifficulty;
    w.__spriteCache = this.spriteCache;
    w.__damageNumberManager = this.damageNumberManager;
    w.__themeData = this.themeData;
    w.__currentThemeId = this.currentThemeId;
    w.__availableThemes = AVAILABLE_THEMES;
    w.__switchTheme = (themeId: string) => this.handleThemeSelect(themeId);
  }
}

