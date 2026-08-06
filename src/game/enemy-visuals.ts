import type { Renderer } from '../renderer/renderer';
import type { Enemy } from '../enemies/enemy';

const HEALTH_BAR_HEIGHT = 4;
const HEALTH_BAR_Y_OFFSET = 6;

/**
 * Returns the fill color for a health bar based on HP ratio and boss status.
 * Bosses always get gold; normal enemies get green/yellow/red gradient.
 */
export function getHealthBarColor(hpRatio: number, isBoss: boolean): string {
  if (isBoss) return '#ffd700'; // gold
  if (hpRatio > 0.6) return '#22c55e'; // green
  if (hpRatio > 0.3) return '#eab308'; // yellow
  return '#ef4444'; // red
}

/**
 * Draw a health bar above an enemy when HP < maxHP.
 * Boss bars are 1.5x wider and gold-colored with a "BOSS" label.
 */
export function drawHealthBar(
  renderer: Renderer,
  enemy: Enemy,
  tileSize: number,
): void {
  const hpRatio = enemy.maxHP > 0 ? enemy.hp / enemy.maxHP : 0;
  if (hpRatio >= 1.0) return; // full HP — no bar

  const baseWidth = enemy.isBoss ? tileSize * 1.5 : tileSize - 4;
  const barWidth = enemy.isBoss ? baseWidth * 1.5 : baseWidth;
  const centerX = enemy.x * tileSize + tileSize / 2;
  const barY = enemy.y * tileSize - HEALTH_BAR_Y_OFFSET;
  const barX = centerX - barWidth / 2;

  // Background — dark semi-transparent
  renderer.save();
  renderer.setAlpha(0.6);
  renderer.drawRect(barX, barY, barWidth, HEALTH_BAR_HEIGHT, '#1a1a2e');
  renderer.restore();

  // Fill
  const fillColor = getHealthBarColor(hpRatio, enemy.isBoss);
  const fillWidth = barWidth * hpRatio;
  renderer.drawRect(barX, barY, fillWidth, HEALTH_BAR_HEIGHT, fillColor);

  // Border
  renderer.drawStrokeRect(barX, barY, barWidth, HEALTH_BAR_HEIGHT, '#000000', 1);

  // Boss label above the health bar
  if (enemy.isBoss) {
    renderer.drawText('BOSS', centerX, barY - 2, {
      color: '#ffd700',
      align: 'center',
      baseline: 'bottom',
      font: 'bold 10px sans-serif',
    });
  }
}

/**
 * Draw a semi-transparent tint overlay on an enemy with active status effects.
 * Slow (frost) → blue tint; Poison (DoT) → green tint.
 * Both can be active simultaneously and will blend.
 */
export function drawStatusTint(
  renderer: Renderer,
  enemy: Enemy,
  tileSize: number,
): void {
  const hasSlow = enemy.activeSlowEffects.length > 0;
  const hasDoT = enemy.activeDoTEffects.length > 0;
  if (!hasSlow && !hasDoT) return;

  const size = enemy.isBoss ? tileSize * 1.5 : tileSize - 4;
  const offset = (tileSize - size) / 2;
  const x = enemy.x * tileSize + offset;
  const y = enemy.y * tileSize + offset;

  renderer.save();
  if (hasSlow) {
    renderer.setAlpha(0.3);
    renderer.drawRect(x, y, size, size, '#3b82f6'); // blue
  }
  if (hasDoT) {
    renderer.setAlpha(0.3);
    renderer.drawRect(x, y, size, size, '#22c55e'); // green
  }
  renderer.restore();
}

