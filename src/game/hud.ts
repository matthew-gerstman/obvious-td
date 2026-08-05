import type { Renderer } from '../renderer/renderer';

interface ButtonBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GOLD_COLOR = '#ffd700';
const LIVES_COLOR = '#ff6b6b';
const WAVE_COLOR = '#e0e0e0';
const HUD_BG = 'rgba(0, 0, 0, 0.6)';
const BUTTON_BG = '#3a5a8a';
const BUTTON_BG_ACTIVE = '#5a8aba';
const BUTTON_BORDER = '#4a90d9';
const BUTTON_TEXT = '#fff';
const BANNER_BG = 'rgba(180, 40, 40, 0.85)';
const BANNER_BORDER = '#ff4444';
const BANNER_TEXT = '#fff';

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;

const START_WAVE_BOUNDS: ButtonBounds = {
  x: 256,
  y: 448,
  w: 128,
  h: 32,
};

const SPEED_BOUNDS: ButtonBounds = {
  x: 576,
  y: 448,
  w: 64,
  h: 32,
};

export interface HUDContext {
  gold: number;
  lives: number;
  waveNumber: number;
  totalWaves: number;
  showStartWave: boolean;
  speedMultiplier: number;
  bossBannerText: string | null;
}

/**
 * Canvas-rendered HUD overlay during gameplay.
 * Shows gold, lives, wave progress, speed toggle, start-wave button,
 * and boss telegraph banner. All rendering via drawRect/drawText.
 */
export class HUD {
  private onStartWave: (() => void) | null = null;
  private onToggleSpeed: (() => void) | null = null;

  constructor(
    onStartWave: (() => void) | null = null,
    onToggleSpeed: (() => void) | null = null,
  ) {
    this.onStartWave = onStartWave;
    this.onToggleSpeed = onToggleSpeed;
  }

  setOnStartWave(onStartWave: () => void): void {
    this.onStartWave = onStartWave;
  }

  setOnToggleSpeed(onToggleSpeed: () => void): void {
    this.onToggleSpeed = onToggleSpeed;
  }

  /**
   * Handles a click at canvas pixel coordinates.
   * Returns true if a HUD button consumed the click.
   */
  handleClick(x: number, y: number, ctx: HUDContext): boolean {
    if (
      ctx.showStartWave &&
      x >= START_WAVE_BOUNDS.x &&
      x < START_WAVE_BOUNDS.x + START_WAVE_BOUNDS.w &&
      y >= START_WAVE_BOUNDS.y &&
      y < START_WAVE_BOUNDS.y + START_WAVE_BOUNDS.h
    ) {
      this.onStartWave?.();
      return true;
    }

    if (
      x >= SPEED_BOUNDS.x &&
      x < SPEED_BOUNDS.x + SPEED_BOUNDS.w &&
      y >= SPEED_BOUNDS.y &&
      y < SPEED_BOUNDS.y + SPEED_BOUNDS.h
    ) {
      this.onToggleSpeed?.();
      return true;
    }

    return false;
  }

  render(renderer: Renderer, ctx: HUDContext): void {
    // Top bar background
    renderer.drawRect(0, 0, CANVAS_WIDTH, 32, HUD_BG);

    // Gold (top-left)
    renderer.drawText(`Gold: ${ctx.gold}`, 10, 21, {
      color: GOLD_COLOR,
      font: 'bold 14px sans-serif',
    });

    // Lives (top-center)
    renderer.drawText(`Lives: ${ctx.lives}`, CANVAS_WIDTH / 2, 21, {
      color: LIVES_COLOR,
      font: 'bold 14px sans-serif',
      align: 'center',
    });

    // Wave (top-right)
    renderer.drawText(`Wave ${ctx.waveNumber}/${ctx.totalWaves}`, CANVAS_WIDTH - 10, 21, {
      color: WAVE_COLOR,
      font: 'bold 14px sans-serif',
      align: 'right',
    });

    // Start Wave button (bottom-center, WAVE_PREP only)
    if (ctx.showStartWave) {
      renderer.drawRect(
        START_WAVE_BOUNDS.x,
        START_WAVE_BOUNDS.y,
        START_WAVE_BOUNDS.w,
        START_WAVE_BOUNDS.h,
        BUTTON_BG,
      );
      this.drawBorder(renderer, START_WAVE_BOUNDS, BUTTON_BORDER);
      renderer.drawText(
        'Start Wave',
        START_WAVE_BOUNDS.x + START_WAVE_BOUNDS.w / 2,
        START_WAVE_BOUNDS.y + 21,
        { color: BUTTON_TEXT, font: 'bold 13px sans-serif', align: 'center' },
      );
    }

    // Speed toggle (bottom-right)
    const speedBg = ctx.speedMultiplier > 1 ? BUTTON_BG_ACTIVE : BUTTON_BG;
    renderer.drawRect(
      SPEED_BOUNDS.x,
      SPEED_BOUNDS.y,
      SPEED_BOUNDS.w,
      SPEED_BOUNDS.h,
      speedBg,
    );
    this.drawBorder(renderer, SPEED_BOUNDS, BUTTON_BORDER);
    renderer.drawText(
      `${ctx.speedMultiplier}x`,
      SPEED_BOUNDS.x + SPEED_BOUNDS.w / 2,
      SPEED_BOUNDS.y + 21,
      { color: BUTTON_TEXT, font: 'bold 13px sans-serif', align: 'center' },
    );

    // Boss telegraph banner (center)
    if (ctx.bossBannerText) {
      const bannerW = 400;
      const bannerH = 40;
      const bannerX = (CANVAS_WIDTH - bannerW) / 2;
      const bannerY = (CANVAS_HEIGHT - bannerH) / 2;

      renderer.drawRect(bannerX, bannerY, bannerW, bannerH, BANNER_BG);
      this.drawBorder(renderer, { x: bannerX, y: bannerY, w: bannerW, h: bannerH }, BANNER_BORDER);
      renderer.drawText(
        ctx.bossBannerText,
        CANVAS_WIDTH / 2,
        bannerY + 26,
        { color: BANNER_TEXT, font: 'bold 16px sans-serif', align: 'center' },
      );
    }
  }

  private drawBorder(renderer: Renderer, b: ButtonBounds, color: string): void {
    renderer.drawRect(b.x, b.y, b.w, 2, color);
    renderer.drawRect(b.x, b.y + b.h - 2, b.w, 2, color);
    renderer.drawRect(b.x, b.y, 2, b.h, color);
    renderer.drawRect(b.x + b.w - 2, b.y, 2, b.h, color);
  }
}

