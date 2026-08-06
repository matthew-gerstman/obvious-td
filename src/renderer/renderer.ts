import type { Sprite } from './sprite-loader';

export interface RendererOptions {
  tileSize?: number;
  mapWidth?: number;
  mapHeight?: number;
}

export interface TextDrawOptions {
  font?: string;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
}

/**
 * Canvas2D renderer for the tower defense game.
 * Handles DPR scaling, viewport fitting, and provides draw primitives.
 * Framework-agnostic — pure Canvas2D API calls.
 */
export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tileSize: number;
  private mapWidth: number;
  private mapHeight: number;
  private dpr: number = 1;
  private resizeListener: () => void;

  constructor(canvas: HTMLCanvasElement, options?: RendererOptions) {
    this.canvas = canvas;
    this.tileSize = options?.tileSize ?? 32;
    this.mapWidth = options?.mapWidth ?? 25;
    this.mapHeight = options?.mapHeight ?? 19;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D rendering context');
    this.ctx = ctx;

    // Required for touch input in WI-4
    canvas.style.touchAction = 'none';

    this.resizeListener = () => this.resize();
    window.addEventListener('resize', this.resizeListener);

    this.resize();
  }

  /** Recalculate backing store and CSS display size. Call on viewport changes. */
  resize(): void {
    const logicalWidth = this.mapWidth * this.tileSize;
    const logicalHeight = this.mapHeight * this.tileSize;

    this.dpr = window.devicePixelRatio || 1;

    // Backing store scaled by DPR for crisp rendering on high-DPI displays
    this.canvas.width = Math.round(logicalWidth * this.dpr);
    this.canvas.height = Math.round(logicalHeight * this.dpr);

    // Reset transform and scale so all drawing uses logical coordinates
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Nearest-neighbor interpolation for crisp pixel-art scaling
    this.ctx.imageSmoothingEnabled = false;

    this.fitToViewport();
  }

  /** Scale CSS display size to fit viewport while maintaining aspect ratio. */
  private fitToViewport(): void {
    const logicalWidth = this.mapWidth * this.tileSize;
    const logicalHeight = this.mapHeight * this.tileSize;
    const scale = Math.min(
      window.innerWidth / logicalWidth,
      window.innerHeight / logicalHeight,
    );
    this.canvas.style.width = `${Math.round(logicalWidth * scale)}px`;
    this.canvas.style.height = `${Math.round(logicalHeight * scale)}px`;
  }

  /** Clear the entire canvas to transparent. */
  clear(): void {
    this.ctx.clearRect(
      0,
      0,
      this.mapWidth * this.tileSize,
      this.mapHeight * this.tileSize,
    );
  }

  /** Blit a sprite to a canvas position. Defaults to the sprite's natural size. */
  drawSprite(
    sprite: Sprite,
    x: number,
    y: number,
    width?: number,
    height?: number,
  ): void {
    const w = width ?? sprite.width;
    const h = height ?? sprite.height;
    this.ctx.drawImage(sprite, x, y, w, h);
  }

  /** Draw a filled rectangle (debug/fallback rendering). */
  drawRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ): void {
    this.ctx.save();
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, width, height);
    this.ctx.restore();
  }

  /** Draw text for UI overlays. */
  drawText(text: string, x: number, y: number, style?: TextDrawOptions): void {
    this.ctx.save();
    if (style?.font) this.ctx.font = style.font;
    if (style?.color) this.ctx.fillStyle = style.color;
    if (style?.align) this.ctx.textAlign = style.align;
    if (style?.baseline) this.ctx.textBaseline = style.baseline;
    this.ctx.fillText(text, x, y);
    this.ctx.restore();
  }

  /** Draw a filled circle. */
  drawCircle(x: number, y: number, radius: number, color: string): void {
    this.ctx.save();
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  /** Draw a stroked rectangle (outline only, no fill). */
  drawStrokeRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    lineWidth: number = 1,
  ): void {
    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.strokeRect(x, y, width, height);
    this.ctx.restore();
  }

  /** Draw a line segment. */
  drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    width: number = 1,
  ): void {
    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  /** Set global alpha (0–1) for transparency. */
  setAlpha(alpha: number): void {
    this.ctx.globalAlpha = alpha;
  }

  /** Save canvas state (wraps ctx.save). */
  save(): void {
    this.ctx.save();
  }

  /** Restore canvas state (wraps ctx.restore). */
  restore(): void {
    this.ctx.restore();
  }

  /** Rotate the canvas context. */
  rotate(angle: number): void {
    this.ctx.rotate(angle);
  }

  /** Translate the canvas context. */
  translate(x: number, y: number): void {
    this.ctx.translate(x, y);
  }

  /** Remove event listeners. Call when the renderer is no longer needed. */
  destroy(): void {
    window.removeEventListener('resize', this.resizeListener);
  }
}
