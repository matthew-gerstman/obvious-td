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
const BUTTON_BG_DISABLED = '#2a2a2a';
const BUTTON_BORDER = '#4a90d9';
const BUTTON_BORDER_DISABLED = '#555';
const BUTTON_TEXT = '#fff';
const BUTTON_TEXT_DISABLED = '#888';
const BANNER_BG = 'rgba(180, 40, 40, 0.85)';
const BANNER_BORDER = '#ff4444';
const BANNER_TEXT = '#fff';
const PREVIEW_COLOR = '#c0c0c0';
const BOSS_WARNING_COLOR = '#ff4444';
const COUNTDOWN_COLOR = '#ffaa00';
const PROGRESS_BAR_BG = '#333';
const PROGRESS_BAR_FILL = '#ffaa00';
const PAUSE_OVERLAY_BG = 'rgba(0, 0, 0, 0.5)';
const PAUSE_TEXT_COLOR = '#fff';

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;
const GAME_AREA_TOP = 32;
const GAME_AREA_BOTTOM = 448;

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

const PAUSE_BOUNDS: ButtonBounds = {
  x: 0,
  y: 448,
  w: 64,
  h: 32,
};

const AUTO_START_BOUNDS: ButtonBounds = {
  x: 70,
  y: 448,
  w: 128,
  h: 32,
};

const AUTO_START_DELAY = 10;

export interface HUDContext {
  gold: number;
  lives: number;
  waveNumber: number;
  totalWaves: number;
  showStartWave: boolean;
  speedMultiplier: number;
  bossBannerText: string | null;
  wavePreviewText: string | null;
  wavePreviewHasBoss: boolean;
  autoStartCountdown: number | null;
  autoStartEnabled: boolean;
  showAutoStartToggle: boolean;
  paused: boolean;
  showPauseButton: boolean;
}

/**
 * Canvas-rendered HUD overlay during gameplay.
 * Shows gold, lives, wave progress, speed toggle, start-wave button,
 * and boss telegraph banner. All rendering via drawRect/drawText.
 */
export class HUD {
  private onStartWave: (() => void) | null = null;
  private onToggleSpeed: (() => void) | null = null;
  private onTogglePause: (() => void) | null = null;
  private onToggleAutoStart: (() => void) | null = null;

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

  setOnTogglePause(onTogglePause: () => void): void {
    this.onTogglePause = onTogglePause;
  }

  setOnToggleAutoStart(onToggleAutoStart: () => void): void {
    this.onToggleAutoStart = onToggleAutoStart;
  }

  /**
   * Handles a click at canvas pixel coordinates.
   * Returns true if a HUD button consumed the click.
   */
  handleClick(x: number, y: number, ctx: HUDContext): boolean {
    // Pause button (works even when paused — that's how you resume)
    if (
      ctx.showPauseButton &&
      x >= PAUSE_BOUNDS.x &&
      x < PAUSE_BOUNDS.x + PAUSE_BOUNDS.w &&
      y >= PAUSE_BOUNDS.y &&
      y < PAUSE_BOUNDS.y + PAUSE_BOUNDS.h
    ) {
      this.onTogglePause?.();
      return true;
    }

    // Auto-start toggle (WAVE_PREP only)
    if (
      ctx.showAutoStartToggle &&
      x >= AUTO_START_BOUNDS.x &&
      x < AUTO_START_BOUNDS.x + AUTO_START_BOUNDS.w &&
      y >= AUTO_START_BOUNDS.y &&
      y < AUTO_START_BOUNDS.y + AUTO_START_BOUNDS.h
    ) {
      this.onToggleAutoStart?.();
      return true;
    }

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

    // Speed toggle (disabled when paused)
    if (
      !ctx.paused &&
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

    // Wave preview (below top bar, WAVE_PREP only)
    if (ctx.wavePreviewText) {
      const color = ctx.wavePreviewHasBoss ? BOSS_WARNING_COLOR : PREVIEW_COLOR;
      renderer.drawText(ctx.wavePreviewText, 10, 48, {
        color,
        font: 'bold 13px sans-serif',
      });

      if (ctx.wavePreviewHasBoss) {
        renderer.drawText('BOSS WAVE', CANVAS_WIDTH - 10, 48, {
          color: BOSS_WARNING_COLOR,
          font: 'bold 13px sans-serif',
          align: 'right',
        });
      }
    }

    // Auto-start countdown (below wave preview, WAVE_PREP only)
    if (ctx.autoStartCountdown !== null) {
      const remaining = Math.ceil(ctx.autoStartCountdown);
      renderer.drawText(`Auto-start in ${remaining}s`, 10, 66, {
        color: COUNTDOWN_COLOR,
        font: 'bold 12px sans-serif',
      });

      // Progress bar (shrinks from full to empty)
      const barWidth = 200;
      const barHeight = 4;
      const barX = 10;
      const barY = 72;
      const progress = Math.max(0, ctx.autoStartCountdown / AUTO_START_DELAY);

      renderer.drawRect(barX, barY, barWidth, barHeight, PROGRESS_BAR_BG);
      renderer.drawRect(barX, barY, barWidth * progress, barHeight, PROGRESS_BAR_FILL);
    }

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

    // Pause button (bottom-left, WAVE_PREP and WAVE_ACTIVE)
    if (ctx.showPauseButton) {
      const pauseBg = ctx.paused ? BUTTON_BG_ACTIVE : BUTTON_BG;
      renderer.drawRect(
        PAUSE_BOUNDS.x,
        PAUSE_BOUNDS.y,
        PAUSE_BOUNDS.w,
        PAUSE_BOUNDS.h,
        pauseBg,
      );
      this.drawBorder(renderer, PAUSE_BOUNDS, BUTTON_BORDER);
      renderer.drawText(
        ctx.paused ? 'Resume' : 'Pause',
        PAUSE_BOUNDS.x + PAUSE_BOUNDS.w / 2,
        PAUSE_BOUNDS.y + 21,
        { color: BUTTON_TEXT, font: 'bold 13px sans-serif', align: 'center' },
      );
    }

    // Auto-start toggle (bottom, WAVE_PREP only)
    if (ctx.showAutoStartToggle) {
      const autoBg = ctx.autoStartEnabled ? BUTTON_BG_ACTIVE : BUTTON_BG;
      renderer.drawRect(
        AUTO_START_BOUNDS.x,
        AUTO_START_BOUNDS.y,
        AUTO_START_BOUNDS.w,
        AUTO_START_BOUNDS.h,
        autoBg,
      );
      this.drawBorder(renderer, AUTO_START_BOUNDS, BUTTON_BORDER);
      renderer.drawText(
        `Auto: ${ctx.autoStartEnabled ? 'ON' : 'OFF'}`,
        AUTO_START_BOUNDS.x + AUTO_START_BOUNDS.w / 2,
        AUTO_START_BOUNDS.y + 21,
        { color: BUTTON_TEXT, font: 'bold 12px sans-serif', align: 'center' },
      );
    }

    // Speed toggle (bottom-right, disabled when paused)
    const speedBg = ctx.paused
      ? BUTTON_BG_DISABLED
      : ctx.speedMultiplier > 1
        ? BUTTON_BG_ACTIVE
        : BUTTON_BG;
    renderer.drawRect(
      SPEED_BOUNDS.x,
      SPEED_BOUNDS.y,
      SPEED_BOUNDS.w,
      SPEED_BOUNDS.h,
      speedBg,
    );
    this.drawBorder(renderer, SPEED_BOUNDS, ctx.paused ? BUTTON_BORDER_DISABLED : BUTTON_BORDER);
    renderer.drawText(
      `${ctx.speedMultiplier}x`,
      SPEED_BOUNDS.x + SPEED_BOUNDS.w / 2,
      SPEED_BOUNDS.y + 21,
      {
        color: ctx.paused ? BUTTON_TEXT_DISABLED : BUTTON_TEXT,
        font: 'bold 13px sans-serif',
        align: 'center',
      },
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

    // PAUSED overlay (over game area, not HUD bars)
    if (ctx.paused) {
      renderer.drawRect(0, GAME_AREA_TOP, CANVAS_WIDTH, GAME_AREA_BOTTOM - GAME_AREA_TOP, PAUSE_OVERLAY_BG);
      renderer.drawText(
        'PAUSED',
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2,
        { color: PAUSE_TEXT_COLOR, font: 'bold 32px sans-serif', align: 'center' },
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

