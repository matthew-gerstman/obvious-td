import type { Renderer } from '../../renderer/renderer';
import type { DifficultyKey } from '../game-state';

export interface MapOption {
  id: string;
  name: string;
  description: string;
}

export interface DifficultyOption {
  key: DifficultyKey;
  name: string;
  description: string;
}

interface ButtonBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TitleButton {
  bounds: ButtonBounds;
  type: 'difficulty' | 'map' | 'start';
  key?: string;
}

const BG_COLOR = '#1a1a2e';
const TITLE_COLOR = '#e0e0e0';
const SUBTITLE_COLOR = '#888';
const HEADER_COLOR = '#ccc';
const BUTTON_BG = '#2a2a4a';
const BUTTON_BG_SELECTED = '#3a5a8a';
const BUTTON_BG_DISABLED = '#222';
const BUTTON_BORDER = '#4a90d9';
const BUTTON_BORDER_SELECTED = '#6ab0ff';
const BUTTON_TEXT = '#e0e0e0';
const BUTTON_TEXT_DIM = '#666';
const DESC_TEXT = '#999';

const DIFFICULTY_OPTIONS: DifficultyOption[] = [
  { key: 'easy', name: 'Easy', description: 'More gold, fewer enemies. Good for learning.' },
  { key: 'medium', name: 'Medium', description: 'Balanced challenge.' },
  { key: 'hard', name: 'Hard', description: 'Less gold, more enemies. For veterans.' },
];

const MAP_OPTIONS: MapOption[] = [
  { id: 'map_single_path', name: 'Single Path', description: 'One road. Master your defense.' },
  { id: 'map_multi_path', name: 'Multi-Path', description: 'Split lanes. Divide your forces.' },
  { id: 'map_branching', name: 'Branching', description: 'Forking paths. Choose your choke point.' },
];

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;

const DIFF_X = 32;
const MAP_X = 352;
const BTN_W = 256;
const BTN_H = 64;
const BTN_GAP = 32;
const START_Y = 128;

const START_BOUNDS: ButtonBounds = {
  x: 224,
  y: 416,
  w: 192,
  h: 48,
};

/**
 * Canvas-rendered title screen with difficulty and map selection.
 * All UI is drawn via the renderer's drawRect/drawText — no HTML DOM.
 * Hit-testing uses canvas pixel coordinates derived from tile taps.
 */
export class TitleScreen {
  selectedDifficulty: DifficultyKey | null = null;
  selectedMapId: string | null = null;
  private buttons: TitleButton[] = [];
  private onStart: (() => void) | null = null;

  constructor(onStart: (() => void) | null = null) {
    this.onStart = onStart;
    this.buildButtons();
  }

  setOnStart(onStart: () => void): void {
    this.onStart = onStart;
  }

  getDifficultyOptions(): DifficultyOption[] {
    return DIFFICULTY_OPTIONS;
  }

  getMapOptions(): MapOption[] {
    return MAP_OPTIONS;
  }

  canStart(): boolean {
    return this.selectedDifficulty !== null && this.selectedMapId !== null;
  }

  /**
   * Handles a click at canvas pixel coordinates.
   * Returns true if a button was hit.
   */
  handleClick(x: number, y: number): boolean {
    for (const btn of this.buttons) {
      if (
        x >= btn.bounds.x &&
        x < btn.bounds.x + btn.bounds.w &&
        y >= btn.bounds.y &&
        y < btn.bounds.y + btn.bounds.h
      ) {
        if (btn.type === 'difficulty' && btn.key) {
          this.selectedDifficulty = btn.key as DifficultyKey;
          return true;
        }
        if (btn.type === 'map' && btn.key) {
          this.selectedMapId = btn.key;
          return true;
        }
        if (btn.type === 'start' && this.canStart()) {
          this.onStart?.();
          return true;
        }
      }
    }
    return false;
  }

  render(renderer: Renderer): void {
    renderer.drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, BG_COLOR);

    renderer.drawText(
      "Don't Let the Demons Into Heaven",
      CANVAS_WIDTH / 2,
      40,
      { color: TITLE_COLOR, font: 'bold 22px sans-serif', align: 'center' },
    );
    renderer.drawText(
      'A Tower Defense Game',
      CANVAS_WIDTH / 2,
      65,
      { color: SUBTITLE_COLOR, font: '14px sans-serif', align: 'center' },
    );

    renderer.drawText('Select Difficulty', DIFF_X, 100, {
      color: HEADER_COLOR,
      font: 'bold 14px sans-serif',
    });
    renderer.drawText('Select Map', MAP_X, 100, {
      color: HEADER_COLOR,
      font: 'bold 14px sans-serif',
    });

    for (let i = 0; i < DIFFICULTY_OPTIONS.length; i++) {
      const opt = DIFFICULTY_OPTIONS[i]!;
      const y = START_Y + i * (BTN_H + BTN_GAP);
      const selected = this.selectedDifficulty === opt.key;
      this.drawSelectButton(renderer, DIFF_X, y, BTN_W, BTN_H, opt.name, opt.description, selected);
    }

    for (let i = 0; i < MAP_OPTIONS.length; i++) {
      const opt = MAP_OPTIONS[i]!;
      const y = START_Y + i * (BTN_H + BTN_GAP);
      const selected = this.selectedMapId === opt.id;
      this.drawSelectButton(renderer, MAP_X, y, BTN_W, BTN_H, opt.name, opt.description, selected);
    }

    const canStart = this.canStart();
    const bg = canStart ? BUTTON_BG_SELECTED : BUTTON_BG_DISABLED;
    const border = canStart ? BUTTON_BORDER_SELECTED : '#333';
    const text = canStart ? BUTTON_TEXT : BUTTON_TEXT_DIM;

    renderer.drawRect(START_BOUNDS.x, START_BOUNDS.y, START_BOUNDS.w, START_BOUNDS.h, bg);
    this.drawBorder(renderer, START_BOUNDS, border);
    renderer.drawText('Start', START_BOUNDS.x + START_BOUNDS.w / 2, START_BOUNDS.y + 30, {
      color: text,
      font: 'bold 18px sans-serif',
      align: 'center',
    });
  }

  private drawSelectButton(
    renderer: Renderer,
    x: number,
    y: number,
    w: number,
    h: number,
    name: string,
    description: string,
    selected: boolean,
  ): void {
    const bg = selected ? BUTTON_BG_SELECTED : BUTTON_BG;
    const border = selected ? BUTTON_BORDER_SELECTED : BUTTON_BORDER;

    renderer.drawRect(x, y, w, h, bg);
    this.drawBorder(renderer, { x, y, w, h }, border);

    renderer.drawText(name, x + 10, y + 22, {
      color: BUTTON_TEXT,
      font: 'bold 14px sans-serif',
    });
    renderer.drawText(description, x + 10, y + 44, {
      color: DESC_TEXT,
      font: '11px sans-serif',
    });
  }

  private drawBorder(renderer: Renderer, b: ButtonBounds, color: string): void {
    renderer.drawRect(b.x, b.y, b.w, 2, color);
    renderer.drawRect(b.x, b.y + b.h - 2, b.w, 2, color);
    renderer.drawRect(b.x, b.y, 2, b.h, color);
    renderer.drawRect(b.x + b.w - 2, b.y, 2, b.h, color);
  }

  private buildButtons(): void {
    this.buttons = [];
    for (let i = 0; i < DIFFICULTY_OPTIONS.length; i++) {
      const opt = DIFFICULTY_OPTIONS[i]!;
      const y = START_Y + i * (BTN_H + BTN_GAP);
      this.buttons.push({
        bounds: { x: DIFF_X, y, w: BTN_W, h: BTN_H },
        type: 'difficulty',
        key: opt.key,
      });
    }
    for (let i = 0; i < MAP_OPTIONS.length; i++) {
      const opt = MAP_OPTIONS[i]!;
      const y = START_Y + i * (BTN_H + BTN_GAP);
      this.buttons.push({
        bounds: { x: MAP_X, y, w: BTN_W, h: BTN_H },
        type: 'map',
        key: opt.id,
      });
    }
    this.buttons.push({
      bounds: START_BOUNDS,
      type: 'start',
    });
  }
}

