import { Renderer } from '../renderer/renderer';
import { GameLoop } from '../engine/game-loop';
import { InputManager } from '../input/input-manager';
import type { TilePoint } from '../input/coordinates';
import { loadMap, type GameMap } from '../maps/map-loader';
import { renderMap } from '../maps/map-renderer';
import { TowerManager } from '../towers/tower-manager';
import { TowerUI, TOWER_COLORS } from '../towers/tower-ui';
import { EconomyManager } from '../economy/economy-manager';
import { WaveRunner } from '../waves/wave-runner';
import { BossTelegraph } from '../waves/boss-telegraph';
import { CombatManager } from '../combat/combat-manager';
import { ProjectileManager } from '../combat/projectile';
import type { TowerData, DifficultyMode, EnemyData, WaveTable } from '../logic/types';
import { GameStateMachine, type GameState, type DifficultyKey } from './game-state';
import { TitleScreen } from './screens/title-screen';
import { ResultScreen, type ResultStats } from './screens/result-screen';
import { HUD, type HUDContext } from './hud';

const TILE_SIZE = 32;
const MAP_WIDTH = 20;
const MAP_HEIGHT = 15;
const TOTAL_WAVES = 30;
const AUTO_START_DELAY = 10; // seconds

const TOWER_FILES = ['gatling', 'cannon', 'frost', 'poison', 'sniper', 'aura', 'economy'];
const ENEMY_FILES = ['grunt', 'runner', 'armored', 'flyer', 'swarm', 'boss'];
const MAP_FILES = ['map_single_path', 'map_multi_path', 'map_branching'];

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

  // Runtime state
  private currentDifficulty: DifficultyMode | null = null;
  private currentWave = 0;
  private speedMultiplier = 1;
  private prepTimer = 0;
  private totalEnemiesKilled = 0;

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
    this.resultScreen.setOnReturn(() => this.returnToTitle());

    // Input — tile taps routed by state
    this.inputManager = new InputManager(canvas, TILE_SIZE, {
      onTileTap: (tile) => {
        this.inputState.lastTap = tile;
        this.handleTileTap(tile);
      },
      onTileHover: (tile) => { this.inputState.lastHover = tile; },
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
    );

    this.waveRunner = new WaveRunner();
    this.projectileManager = new ProjectileManager();
    this.combatManager = new CombatManager(this.economyManager, this.projectileManager);

    this.currentWave = 0;
    this.speedMultiplier = 1;
    this.prepTimer = 0;
    this.totalEnemiesKilled = 0;
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
    this.gameLoop.setSpeed(1);
  }

  /** Toggles between 1x and 2x speed. */
  toggleSpeed(): void {
    this.speedMultiplier = this.speedMultiplier === 1 ? 2 : 1;
    this.gameLoop.setSpeed(this.speedMultiplier);
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

    this.prepTimer += dt;
    if (this.prepTimer >= AUTO_START_DELAY && this.currentWave < TOTAL_WAVES) {
      this.startWave();
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
    this.combatManager.update(dt, this.towerManager.getAllTowers(), aliveEnemies);

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

    renderMap(this.renderer, this.gameMap, {
      showBuildable: true,
      tileSize: TILE_SIZE,
    });

    // Towers
    if (this.towerManager) {
      for (const tower of this.towerManager.getAllTowers()) {
        const color = TOWER_COLORS[tower.archetype.archetype] ?? '#888';
        const inset = 4;
        this.renderer.drawRect(
          tower.tileX * TILE_SIZE + inset,
          tower.tileY * TILE_SIZE + inset,
          TILE_SIZE - inset * 2,
          TILE_SIZE - inset * 2,
          color,
        );
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

    // Enemies
    if (this.waveRunner) {
      for (const enemy of this.waveRunner.getAliveEnemies()) {
        const color = enemy.flying ? '#ff6b6b' : '#e03939';
        this.renderer.drawRect(
          enemy.x * TILE_SIZE + 8,
          enemy.y * TILE_SIZE + 8,
          TILE_SIZE - 16,
          TILE_SIZE - 16,
          color,
        );
      }
    }

    // Projectiles
    if (this.projectileManager) {
      this.projectileManager.render(this.renderer, TILE_SIZE);
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
    return {
      gold: this.economyManager?.getGold() ?? 0,
      lives: this.economyManager?.getLives() ?? 0,
      waveNumber: this.currentWave,
      totalWaves: TOTAL_WAVES,
      showStartWave: state === 'WAVE_PREP',
      speedMultiplier: this.speedMultiplier,
      bossBannerText: this.getBossBannerText(),
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
      // Tower archetypes
      this.towerArchetypes = await Promise.all(
        TOWER_FILES.map(async (name) => {
          const res = await fetch(`/data/archetypes/tower_${name}.json`);
          return (await res.json()) as TowerData;
        }),
      );

      // Enemy archetypes
      await Promise.all(
        ENEMY_FILES.map(async (name) => {
          const res = await fetch(`/data/archetypes/enemy_${name}.json`);
          const data = (await res.json()) as EnemyData;
          this.enemyArchetypes[data.id] = data;
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

      // Create default systems for backward compatibility with existing tests
      this.createDefaultSystems();

      this.dataLoaded = true;
      this.exposeSystemHooks();
    } catch {
      // Data loading failed — game stays on title screen
      // which renders without requiring loaded data
    }
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
    );

    this.waveRunner = new WaveRunner();
    this.projectileManager = new ProjectileManager();
    this.combatManager = new CombatManager(this.economyManager, this.projectileManager);
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
    w.__enemyArchetypes = this.enemyArchetypes;
    w.__towerArchetypes = this.towerArchetypes;
    w.__waveTable = this.waveTable;
    w.__difficulty = this.currentDifficulty;
  }
}

