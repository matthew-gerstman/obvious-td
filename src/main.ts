import { Renderer } from './renderer/renderer';
import { GameLoop } from './engine/game-loop';
import { createSolidColorSprite } from './renderer/sprite-loader';
import { InputManager } from './input/input-manager';
import type { TilePoint } from './input/coordinates';
import { loadMap, type GameMap } from './maps/map-loader';
import { renderMap } from './maps/map-renderer';
import { TowerManager } from './towers/tower-manager';
import { EconomyManager } from './economy/economy-manager';
import { TowerUI, TOWER_COLORS } from './towers/tower-ui';
import type { TowerData, DifficultyMode } from './logic/types';

const TILE_SIZE = 32;
const MAP_WIDTH = 20;
const MAP_HEIGHT = 15;

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('Canvas element #game not found');

const renderer = new Renderer(canvas, {
  tileSize: TILE_SIZE,
  mapWidth: MAP_WIDTH,
  mapHeight: MAP_HEIGHT,
});

// Test sprite for visual feedback and E2E pixel assertions (renderer.spec.ts)
const testSprite = createSolidColorSprite(32, 32, '#4a90d9');

let tick = 0;

// Tower/economy state — initialized async after data loads
let towerManager: TowerManager | null = null;
let economyManager: EconomyManager | null = null;
let towerUI: TowerUI | null = null;
let gameMap: GameMap | null = null;

const update = (dt: number): void => {
  tick++;
  if (economyManager && towerManager) {
    economyManager.processEconomyIncome(towerManager.getAllTowers(), dt);
  }
};

const render = (alpha: number): void => {
  renderer.clear();

  // Render map if loaded
  if (gameMap) {
    renderMap(renderer, gameMap, { showBuildable: true, tileSize: TILE_SIZE });
  }

  // Test sprite at known position — E2E pixel assertion target (renderer.spec.ts)
  renderer.drawSprite(testSprite, 0, 0);

  // Test rect at known position — E2E pixel assertion target (renderer.spec.ts)
  renderer.drawRect(64, 0, 32, 32, '#ff6b6b');

  // Render towers
  if (towerManager) {
    for (const tower of towerManager.getAllTowers()) {
      const color = TOWER_COLORS[tower.archetype.archetype] ?? '#888';
      const inset = 4;
      renderer.drawRect(
        tower.tileX * TILE_SIZE + inset,
        tower.tileY * TILE_SIZE + inset,
        TILE_SIZE - inset * 2,
        TILE_SIZE - inset * 2,
        color,
      );
      // Tier indicator dots
      for (let i = 0; i < tower.tier; i++) {
        renderer.drawRect(
          tower.tileX * TILE_SIZE + 6 + i * 8,
          tower.tileY * TILE_SIZE + TILE_SIZE - 8,
          4,
          4,
          '#fff',
        );
      }
    }
  }

  // Moving rect for visual feedback (renderer.spec.ts)
  const x = (tick * 2 + alpha * 2) % (MAP_WIDTH * TILE_SIZE);
  renderer.drawRect(x, 100, 32, 32, '#51cf66');

  // UI overlay
  renderer.drawText(`Tick: ${tick}`, 10, 160, {
    color: '#e0e0e0',
    font: '16px sans-serif',
  });

  if (economyManager) {
    renderer.drawText(`Gold: ${economyManager.getGold()}`, 10, 180, {
      color: '#ffd700',
      font: '14px sans-serif',
    });
  }

  // Render tower UI panels
  if (towerUI) {
    towerUI.render();
  }
};

const gameLoop = new GameLoop(update, render);
gameLoop.start();

// Expose for E2E testing
(window as unknown as { __gameLoop: GameLoop }).__gameLoop = gameLoop;

// Input layer — tile-based callback API for touch and mouse
const inputState: {
  lastTap: TilePoint | null;
  lastHover: TilePoint | null;
  lastDragStart: TilePoint | null;
  lastDragMove: TilePoint | null;
  lastDragEnd: TilePoint | null;
} = {
  lastTap: null,
  lastHover: null,
  lastDragStart: null,
  lastDragMove: null,
  lastDragEnd: null,
};

new InputManager(canvas, TILE_SIZE, {
  onTileTap: (tile) => {
    inputState.lastTap = tile;
    if (towerUI) {
      towerUI.handleTileTap(tile);
    }
  },
  onTileHover: (tile) => { inputState.lastHover = tile; },
  onTileDragStart: (tile) => { inputState.lastDragStart = tile; },
  onTileDragMove: (tile) => { inputState.lastDragMove = tile; },
  onTileDragEnd: (tile) => { inputState.lastDragEnd = tile; },
});

// Expose input state for E2E testing
(window as unknown as { __inputTestHook: typeof inputState }).__inputTestHook = inputState;

// Async initialization — load data and create game systems
async function initGame(): Promise<void> {
  // Load map data
  const mapResponse = await fetch('/data/maps/map_single_path.json');
  const mapData = await mapResponse.json();
  gameMap = loadMap(mapData as object);

  // Load tower data
  const towerFiles = ['gatling', 'cannon', 'frost', 'poison', 'sniper', 'aura', 'economy'];
  const towerArchetypes: TowerData[] = await Promise.all(
    towerFiles.map(async (name) => {
      const res = await fetch(`/data/archetypes/tower_${name}.json`);
      return (await res.json()) as TowerData;
    }),
  );

  // Load difficulty
  const diffResponse = await fetch('/data/difficulty.json');
  const diffData = (await diffResponse.json()) as { modes: { easy: DifficultyMode } };
  const easyMode = diffData.modes.easy;

  // Create game systems
  economyManager = new EconomyManager();
  economyManager.initialize(easyMode);

  towerManager = new TowerManager(gameMap);
  towerUI = new TowerUI(renderer, towerManager, economyManager, towerArchetypes, TILE_SIZE, MAP_WIDTH);

  // Expose for E2E testing
  (window as unknown as { __towerManager: TowerManager }).__towerManager = towerManager;
  (window as unknown as { __economyManager: EconomyManager }).__economyManager = economyManager;
  (window as unknown as { __towerUI: TowerUI }).__towerUI = towerUI;
  (window as unknown as { __gameMap: GameMap }).__gameMap = gameMap;
  (window as unknown as { __towerArchetypes: TowerData[] }).__towerArchetypes = towerArchetypes;
}

void initGame();
