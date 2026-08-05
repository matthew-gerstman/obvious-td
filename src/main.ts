import { Game } from './game/game';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('Canvas element #game not found');

new Game(canvas);
