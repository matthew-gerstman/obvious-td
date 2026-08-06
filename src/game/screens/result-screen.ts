import type { Renderer } from '../../renderer/renderer';
import type { ResultTheme } from '../../logic/types';

export type ResultType = 'victory' | 'defeat';

export interface ResultStats {
  wavesSurvived: number;
  goldRemaining: number;
  towersBuilt: number;
  waveReached: number;
  enemiesKilled: number;
}

interface ButtonBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BG_COLOR = '#1a1a2e';
const VICTORY_COLOR = '#51cf66';
const DEFEAT_COLOR = '#ff6b6b';
const STATS_COLOR = '#e0e0e0';
const STATS_LABEL_COLOR = '#aaa';
const BUTTON_BG = '#3a5a8a';
const BUTTON_BORDER = '#4a90d9';
const BUTTON_TEXT = '#fff';

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;

const RETURN_BOUNDS: ButtonBounds = {
  x: 224,
  y: 360,
  w: 192,
  h: 48,
};

/**
 * Canvas-rendered victory and defeat screens with stats and a return button.
 * No HTML DOM — all rendering via the renderer's drawRect/drawText.
 */
export class ResultScreen {
  resultTheme: ResultTheme | null = null;
  private onReturn: (() => void) | null = null;

  constructor(onReturn: (() => void) | null = null) {
    this.onReturn = onReturn;
  }

  setTheme(resultTheme: ResultTheme | null): void {
    this.resultTheme = resultTheme;
  }

  setOnReturn(onReturn: () => void): void {
    this.onReturn = onReturn;
  }

  /**
   * Handles a click at canvas pixel coordinates.
   * Returns true if the Return button was hit.
   */
  handleClick(x: number, y: number): boolean {
    if (
      x >= RETURN_BOUNDS.x &&
      x < RETURN_BOUNDS.x + RETURN_BOUNDS.w &&
      y >= RETURN_BOUNDS.y &&
      y < RETURN_BOUNDS.y + RETURN_BOUNDS.h
    ) {
      this.onReturn?.();
      return true;
    }
    return false;
  }

  render(renderer: Renderer, type: ResultType, stats: ResultStats): void {
    const t = this.resultTheme;
    const bgColor = t?.bgColor ?? BG_COLOR;
    const victoryText = t?.victoryText ?? 'Heaven is Safe!';
    const defeatText = t?.defeatText ?? 'Demons Broke Through';
    const victoryColor = t?.victoryColor ?? VICTORY_COLOR;
    const defeatColor = t?.defeatColor ?? DEFEAT_COLOR;
    const returnText = t?.returnText ?? 'Return to Title';

    renderer.drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, bgColor);

    const title = type === 'victory' ? victoryText : defeatText;
    const titleColor = type === 'victory' ? victoryColor : defeatColor;

    renderer.drawText(title, CANVAS_WIDTH / 2, 120, {
      color: titleColor,
      font: 'bold 28px sans-serif',
      align: 'center',
    });

    let lineY = 180;
    const lineHeight = 28;

    if (type === 'victory') {
      this.drawStatLine(renderer, 'Waves Survived:', `${stats.wavesSurvived}/30`, lineY);
      lineY += lineHeight;
      this.drawStatLine(renderer, 'Gold Remaining:', String(stats.goldRemaining), lineY);
      lineY += lineHeight;
      this.drawStatLine(renderer, 'Towers Built:', String(stats.towersBuilt), lineY);
    } else {
      this.drawStatLine(renderer, 'Wave Reached:', String(stats.waveReached), lineY);
      lineY += lineHeight;
      this.drawStatLine(renderer, 'Enemies Killed:', String(stats.enemiesKilled), lineY);
    }

    renderer.drawRect(
      RETURN_BOUNDS.x,
      RETURN_BOUNDS.y,
      RETURN_BOUNDS.w,
      RETURN_BOUNDS.h,
      BUTTON_BG,
    );
    this.drawBorder(renderer, RETURN_BOUNDS, BUTTON_BORDER);
    renderer.drawText(
      returnText,
      RETURN_BOUNDS.x + RETURN_BOUNDS.w / 2,
      RETURN_BOUNDS.y + 30,
      { color: BUTTON_TEXT, font: 'bold 14px sans-serif', align: 'center' },
    );
  }

  private drawStatLine(
    renderer: Renderer,
    label: string,
    value: string,
    y: number,
  ): void {
    renderer.drawText(label, CANVAS_WIDTH / 2 - 80, y, {
      color: STATS_LABEL_COLOR,
      font: '14px sans-serif',
      align: 'right',
    });
    renderer.drawText(value, CANVAS_WIDTH / 2 + 10, y, {
      color: STATS_COLOR,
      font: 'bold 14px sans-serif',
      align: 'left',
    });
  }

  private drawBorder(renderer: Renderer, b: ButtonBounds, color: string): void {
    renderer.drawRect(b.x, b.y, b.w, 2, color);
    renderer.drawRect(b.x, b.y + b.h - 2, b.w, 2, color);
    renderer.drawRect(b.x, b.y, 2, b.h, color);
    renderer.drawRect(b.x + b.w - 2, b.y, 2, b.h, color);
  }
}

