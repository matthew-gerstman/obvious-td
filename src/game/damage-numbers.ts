import type { Renderer } from '../renderer/renderer';

interface DamageNumber {
  x: number;
  y: number;
  value: number;
  alpha: number;
  lifetime: number;
  vy: number;
}

const MAX_LIFETIME = 0.8; // seconds before fully faded
const FLOAT_SPEED = 30; // pixels per second upward
const MAX_ACTIVE = 50;

/**
 * Manages floating damage numbers that appear when enemies take damage.
 * Numbers float upward and fade out over ~0.8 seconds. Capped at
 * MAX_ACTIVE concurrent numbers to prevent unbounded growth.
 */
export class DamageNumberManager {
  private numbers: DamageNumber[] = [];

  /**
   * Spawn a damage number at the given tile position.
   * If at capacity, the oldest number is evicted.
   */
  spawn(x: number, y: number, damage: number): void {
    if (this.numbers.length >= MAX_ACTIVE) {
      this.numbers.shift();
    }
    this.numbers.push({
      x,
      y,
      value: Math.round(damage),
      alpha: 1.0,
      lifetime: 0,
      vy: FLOAT_SPEED,
    });
  }

  /**
   * Advance all damage numbers by dt seconds. Numbers float upward
   * and their alpha decreases linearly. Expired numbers are removed.
   */
  update(dt: number): void {
    for (const num of this.numbers) {
      num.lifetime += dt;
      num.y -= num.vy * dt;
      num.alpha = Math.max(0, 1 - num.lifetime / MAX_LIFETIME);
    }
    this.numbers = this.numbers.filter((n) => n.alpha > 0);
  }

  /**
   * Render all active damage numbers to the canvas.
   * Positions are in tile coordinates, converted to pixels via tileSize.
   */
  render(renderer: Renderer, tileSize: number): void {
    for (const num of this.numbers) {
      renderer.save();
      renderer.setAlpha(num.alpha);
      renderer.drawText(
        String(num.value),
        num.x * tileSize + tileSize / 2,
        num.y * tileSize,
        {
          color: '#ffffff',
          align: 'center',
          baseline: 'bottom',
          font: 'bold 12px sans-serif',
        },
      );
      renderer.restore();
    }
  }

  /** Number of currently active damage numbers. */
  getActiveCount(): number {
    return this.numbers.length;
  }

  /** Remove all damage numbers. */
  clear(): void {
    this.numbers = [];
  }
}

