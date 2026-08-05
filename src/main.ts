import { Renderer } from './renderer/renderer';
import { GameLoop } from './engine/game-loop';
import { createSolidColorSprite } from './renderer/sprite-loader';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('Canvas element #game not found');

const renderer = new Renderer(canvas, {
  tileSize: 32,
  mapWidth: 25,
  mapHeight: 19,
});

// Test sprite for visual feedback and E2E pixel assertions
const testSprite = createSolidColorSprite(32, 32, '#4a90d9');

let tick = 0;

const update = (_dt: number): void => {
  tick++;
};

const render = (alpha: number): void => {
  renderer.clear();

  // Static sprite at known position — E2E pixel assertion target
  renderer.drawSprite(testSprite, 0, 0);

  // Static rect at known position — E2E pixel assertion target
  renderer.drawRect(64, 0, 32, 32, '#ff6b6b');

  // Moving rect for visual feedback
  const x = (tick * 2 + alpha * 2) % (25 * 32);
  renderer.drawRect(x, 100, 32, 32, '#51cf66');

  // UI overlay
  renderer.drawText(`Tick: ${tick}`, 10, 160, {
    color: '#e0e0e0',
    font: '16px sans-serif',
  });
};

const gameLoop = new GameLoop(update, render);
gameLoop.start();

// Expose for E2E testing
(window as unknown as { __gameLoop: GameLoop }).__gameLoop = gameLoop;
