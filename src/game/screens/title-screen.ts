import type { Renderer } from '../../renderer/renderer';
import type { DifficultyKey } from '../game-state';
import type { TitleTheme, ThemeOption, ThemeData } from '../../logic/types';

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
  type: 'difficulty' | 'map' | 'start' | 'theme';
  key?: string;
}

// Default hardcoded values — used when no theme is provided
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

// Theme selector layout
const THEME_Y = 68;
const THEME_BTN_W = 150;
const THEME_BTN_H = 20;
const THEME_BTN_GAP = 8;

/**
 * Canvas-rendered title screen with difficulty and map selection.
 * All UI is drawn via the renderer's drawRect/drawText — no HTML DOM.
 * Hit-testing uses canvas pixel coordinates derived from tile taps.
 */
export class TitleScreen {
  selectedDifficulty: DifficultyKey | null = null;
  selectedMapId: string | null = null;
  selectedTheme = 'demons-heaven';
  private buttons: TitleButton[] = [];
  private onStart: (() => void) | null = null;
  private onThemeSelect: ((themeId: string) => void) | null = null;
  private titleTheme: TitleTheme | null = null;
  private mapOverrides: Record<string, Record<string, string>> | null = null;
  private availableThemes: ThemeOption[] = [];

  constructor(onStart: (() => void) | null = null) {
    this.onStart = onStart;
    this.buildButtons();
  }

  setOnStart(onStart: () => void): void {
    this.onStart = onStart;
  }

  setOnThemeSelect(callback: (themeId: string) => void): void {
    this.onThemeSelect = callback;
  }

  /** Set theme data for title screen colors, text, and map names. */
  setThemeData(themeData: ThemeData | null, availableThemes: ThemeOption[]): void {
    this.titleTheme = themeData?.ui?.title ?? null;
    this.mapOverrides = themeData?.overrides ?? null;
    this.availableThemes = availableThemes;
    this.buildButtons();
  }

  getDifficultyOptions(): DifficultyOption[] {
    return DIFFICULTY_OPTIONS;
  }

  getMapOptions(): MapOption[] {
    return this.getEffectiveMapOptions();
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
        if (btn.type === 'theme' && btn.key) {
          this.selectedTheme = btn.key;
          this.onThemeSelect?.(btn.key);
          return true;
        }
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

  /** Resolve effective title theme values with fallbacks to hardcoded defaults. */
  private resolveTitleTheme(): TitleTheme {
    return {
      title: this.titleTheme?.title ?? "Don't Let the Demons Into Heaven",
      subtitle: this.titleTheme?.subtitle ?? 'A Tower Defense Game',
      bgColor: this.titleTheme?.bgColor ?? BG_COLOR,
      titleColor: this.titleTheme?.titleColor ?? TITLE_COLOR,
      buttonBg: this.titleTheme?.buttonBg ?? BUTTON_BG,
      buttonBgSelected: this.titleTheme?.buttonBgSelected ?? BUTTON_BG_SELECTED,
      buttonBorder: this.titleTheme?.buttonBorder ?? BUTTON_BORDER,
      buttonBorderSelected: this.titleTheme?.buttonBorderSelected ?? BUTTON_BORDER_SELECTED,
    };
  }

  private getEffectiveMapOptions(): MapOption[] {
    if (!this.mapOverrides) return MAP_OPTIONS;
    return MAP_OPTIONS.map((opt) => {
      const override = this.mapOverrides[opt.id];
      if (!override) return opt;
      return {
        id: opt.id,
        name: override.name ?? opt.name,
        description: override.description ?? opt.description,
      };
    });
  }

  private getThemeButtonBounds(): ButtonBounds[] {
    if (this.availableThemes.length === 0) return [];
    const totalWidth =
      this.availableThemes.length * THEME_BTN_W +
      (this.availableThemes.length - 1) * THEME_BTN_GAP;
    let x = (CANVAS_WIDTH - totalWidth) / 2;
    return this.availableThemes.map(() => {
      const bounds = { x, y: THEME_Y, w: THEME_BTN_W, h: THEME_BTN_H };
      x += THEME_BTN_W + THEME_BTN_GAP;
      return bounds;
    });
  }

  render(renderer: Renderer): void {
    const t = this.resolveTitleTheme();
    const mapOpts = this.getEffectiveMapOptions();

    renderer.drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, t.bgColor);

    // Dynamic font size: long titles (e.g. DBZ "Don't Let the Villains Destroy Earth!")
    // get a smaller font so they fit within the 640px canvas.
    const titleLen = t.title.length;
    const titleFont = titleLen > 32 ? 'bold 18px sans-serif' : 'bold 22px sans-serif';

    renderer.drawText(
      t.title,
      CANVAS_WIDTH / 2,
      32,
      { color: t.titleColor, font: titleFont, align: 'center' },
    );
    renderer.drawText(
      t.subtitle,
      CANVAS_WIDTH / 2,
      55,
      { color: SUBTITLE_COLOR, font: '14px sans-serif', align: 'center' },
    );

    // Theme selector row
    if (this.availableThemes.length > 0) {
      const themeBounds = this.getThemeButtonBounds();
      for (let i = 0; i < this.availableThemes.length; i++) {
        const opt = this.availableThemes[i]!;
        const bounds = themeBounds[i]!;
        const selected = this.selectedTheme === opt.id;
        const bg = selected ? t.buttonBgSelected : t.buttonBg;
        const border = selected ? t.buttonBorderSelected : t.buttonBorder;
        renderer.drawRect(bounds.x, bounds.y, bounds.w, bounds.h, bg);
        this.drawBorder(renderer, bounds, border);
        renderer.drawText(opt.name, bounds.x + bounds.w / 2, bounds.y + 14, {
          color: BUTTON_TEXT,
          font: 'bold 11px sans-serif',
          align: 'center',
        });
      }
    }

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
      this.drawSelectButton(renderer, DIFF_X, y, BTN_W, BTN_H, opt.name, opt.description, selected, t);
    }

    for (let i = 0; i < mapOpts.length; i++) {
      const opt = mapOpts[i]!;
      const y = START_Y + i * (BTN_H + BTN_GAP);
      const selected = this.selectedMapId === opt.id;
      this.drawSelectButton(renderer, MAP_X, y, BTN_W, BTN_H, opt.name, opt.description, selected, t);
    }

    const canStart = this.canStart();
    const bg = canStart ? t.buttonBgSelected : BUTTON_BG_DISABLED;
    const border = canStart ? t.buttonBorderSelected : '#333';
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
    t: Pick<TitleTheme, 'buttonBg' | 'buttonBgSelected' | 'buttonBorder' | 'buttonBorderSelected'>,
  ): void {
    const bg = selected ? t.buttonBgSelected : t.buttonBg;
    const border = selected ? t.buttonBorderSelected : t.buttonBorder;

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

    // Theme selector buttons
    const themeBounds = this.getThemeButtonBounds();
    for (let i = 0; i < this.availableThemes.length; i++) {
      const opt = this.availableThemes[i]!;
      const bounds = themeBounds[i]!;
      this.buttons.push({
        bounds,
        type: 'theme',
        key: opt.id,
      });
    }

    for (let i = 0; i < DIFFICULTY_OPTIONS.length; i++) {
      const opt = DIFFICULTY_OPTIONS[i]!;
      const y = START_Y + i * (BTN_H + BTN_GAP);
      this.buttons.push({
        bounds: { x: DIFF_X, y, w: BTN_W, h: BTN_H },
        type: 'difficulty',
        key: opt.key,
      });
    }

    const mapOpts = this.getEffectiveMapOptions();
    for (let i = 0; i < mapOpts.length; i++) {
      const opt = mapOpts[i]!;
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

