import type { Renderer } from '../renderer/renderer';

export interface MuzzleFlash {
  tileX: number;
  tileY: number;
  targetX: number;
  targetY: number;
  age: number;
  lifetime: number;
  color: string;
}

const FLASH_LIFETIME = 0.08; // 80ms

const FLASH_COLORS: Record<string, string> = {
  gatling: '#ffeb3b',
  cannon: '#ff5722',
  frost: '#80deea',
  poison: '#76ff03',
  sniper: '#e91e63',
};

/**
 * Tracks short-lived muzzle flash effects for tower firing animation.
 * Each flash fades from full opacity to zero over its lifetime (~80ms).
 * Flashes orient toward the target enemy for directional visual feedback.
 */
export class MuzzleFlashManager {
  private flashes: MuzzleFlash[] = [];

  /** Spawn a muzzle flash at a tower position aimed at the target. */
  spawnFlash(
    towerTileX: number,
    towerTileY: number,
    targetX: number,
    targetY: number,
    towerType: string,
  ): void {
    this.flashes.push({
      tileX: towerTileX,
      tileY: towerTileY,
      targetX,
      targetY,
      age: 0,
      lifetime: FLASH_LIFETIME,
      color: FLASH_COLORS[towerType] ?? '#ffffff',
    });
  }

  /** Advance all flash timers and remove expired flashes. */
  update(dt: number): void {
    for (const f of this.flashes) {
      f.age += dt;
    }
    this.flashes = this.flashes.filter((f) => f.age < f.lifetime);
  }

  /** Render active muzzle flashes on the canvas. */
  render(renderer: Renderer, tileSize: number): void {
    for (const flash of this.flashes) {
      const progress = flash.age / flash.lifetime;
      const alpha = 1.0 - progress;

      const cx = flash.tileX * tileSize + tileSize / 2;
      const cy = flash.tileY * tileSize + tileSize / 2;

      // Direction from tower toward target
      const dx = flash.targetX - flash.tileX;
      const dy = flash.targetY - flash.tileY;
      const angle = Math.atan2(dy, dx);

      renderer.save();
      renderer.setAlpha(alpha);
      renderer.translate(cx, cy);
      renderer.rotate(angle);

      // Bright circle at the muzzle position (offset toward target)
      renderer.drawCircle(tileSize * 0.3, 0, 5, flash.color);

      renderer.restore();
    }
  }

  /** Returns active flashes (for testing). */
  getActiveFlashes(): MuzzleFlash[] {
    return this.flashes;
  }

  /** Clear all flashes. */
  clear(): void {
    this.flashes = [];
  }
}

