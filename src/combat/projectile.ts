import type { Renderer } from '../renderer/renderer';

export interface Projectile {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  age: number;
  lifetime: number;
  color: string;
}

const PROJECTILE_COLORS: Record<string, string> = {
  gatling: '#ffeb3b',
  cannon: '#ff5722',
  frost: '#80deea',
  poison: '#76ff03',
  sniper: '#e91e63',
};

const PROJECTILE_LIFETIME = 0.15;

/**
 * Minimal projectile visual feedback for tower firing.
 * Tracks short-lived projectiles from tower to target and renders them
 * as small colored squares on the canvas.
 */
export class ProjectileManager {
  private projectiles: Projectile[] = [];

  spawnProjectile(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    towerType: string,
  ): void {
    this.projectiles.push({
      fromX,
      fromY,
      toX,
      toY,
      age: 0,
      lifetime: PROJECTILE_LIFETIME,
      color: PROJECTILE_COLORS[towerType] ?? '#ffffff',
    });
  }

  update(dt: number): void {
    for (const p of this.projectiles) {
      p.age += dt;
    }
    this.projectiles = this.projectiles.filter((p) => p.age < p.lifetime);
  }

  render(renderer: Renderer, tileSize: number): void {
    for (const p of this.projectiles) {
      const progress = p.age / p.lifetime;
      const x = p.fromX + (p.toX - p.fromX) * progress;
      const y = p.fromY + (p.toY - p.fromY) * progress;
      renderer.drawRect(x * tileSize, y * tileSize, 4, 4, p.color);
    }
  }

  getActiveProjectiles(): Projectile[] {
    return this.projectiles;
  }

  clear(): void {
    this.projectiles = [];
  }
}

