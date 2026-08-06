import type { TilePoint } from './coordinates';
import { screenToTile } from './coordinates';

export interface InputCallbacks {
  onTileTap: (tile: TilePoint) => void;
  onTileHover?: (tile: TilePoint) => void;
  onTileDragStart?: (tile: TilePoint) => void;
  onTileDragMove?: (tile: TilePoint) => void;
  onTileDragEnd?: (tile: TilePoint) => void;
}

/** Movement in screen pixels before a press becomes a drag. */
const DRAG_THRESHOLD = 5;

/**
 * Unified input manager that abstracts touch, mouse, and pointer events
 * into a tile-based callback API.
 *
 * Pointer Events are used when feature-detected (`'PointerEvent' in window`),
 * providing a single unified path. When unavailable, the manager falls back
 * to separate touch + mouse listeners for older browsers.
 *
 * Touch events call preventDefault() to suppress browser scroll/zoom/gestures.
 * Only the first touch is used for tile interaction; additional touches are
 * ignored.
 */
export class InputManager {
  private canvas: HTMLCanvasElement;
  private tileSize: number;
  private callbacks: InputCallbacks;
  private usePointerEvents: boolean;

  // Interaction state
  private isPointerDown = false;
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private startTile: TilePoint | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    tileSize: number,
    callbacks: InputCallbacks,
  ) {
    this.canvas = canvas;
    this.tileSize = tileSize;
    this.callbacks = callbacks;
    this.usePointerEvents = 'PointerEvent' in window;

    // Ensure touch gestures are suppressed (idempotent — renderer also sets this)
    canvas.style.touchAction = 'none';

    if (this.usePointerEvents) {
      this.setupPointerEvents();
    } else {
      this.setupTouchEvents();
      this.setupMouseEvents();
    }
  }

  // ── Pointer Events (unified path) ───────────────────────────────────

  private setupPointerEvents(): void {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
  }

  private handlePointerDown = (e: PointerEvent): void => {
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startTile = screenToTile(e.clientX, e.clientY, this.canvas, this.tileSize);
    this.isPointerDown = true;
    this.isDragging = false;
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.isPointerDown) {
      if (!this.isDragging && this.distanceFromStart(e.clientX, e.clientY) > DRAG_THRESHOLD) {
        this.isDragging = true;
        if (this.startTile) {
          this.callbacks.onTileDragStart?.(this.startTile);
        }
      }
      if (this.isDragging) {
        const tile = screenToTile(e.clientX, e.clientY, this.canvas, this.tileSize);
        this.callbacks.onTileDragMove?.(tile);
      }
    } else if (e.pointerType === 'mouse') {
      // Hover is desktop-only — no touch equivalent
      const tile = screenToTile(e.clientX, e.clientY, this.canvas, this.tileSize);
      this.callbacks.onTileHover?.(tile);
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (!this.isPointerDown) return;
    if (this.isDragging) {
      const tile = screenToTile(e.clientX, e.clientY, this.canvas, this.tileSize);
      this.callbacks.onTileDragEnd?.(tile);
    } else if (this.startTile) {
      this.callbacks.onTileTap(this.startTile);
    }
    this.resetInteraction();
  };

  private handlePointerLeave = (e: PointerEvent): void => {
    if (this.isDragging) {
      const tile = screenToTile(e.clientX, e.clientY, this.canvas, this.tileSize);
      this.callbacks.onTileDragEnd?.(tile);
    }
    this.resetInteraction();
  };

  // ── Touch Events (fallback) ─────────────────────────────────────────

  private setupTouchEvents(): void {
    this.canvas.addEventListener('touchstart', this.handleTouchStart);
    this.canvas.addEventListener('touchmove', this.handleTouchMove);
    this.canvas.addEventListener('touchend', this.handleTouchEnd);
  }

  private handleTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    // Ignore multi-touch — only track the first touch
    if (this.isPointerDown) return;
    const touch = e.touches[0];
    if (!touch) return;
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.startTile = screenToTile(touch.clientX, touch.clientY, this.canvas, this.tileSize);
    this.isPointerDown = true;
    this.isDragging = false;
  };

  private handleTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    if (!this.isPointerDown) return;
    const touch = e.touches[0];
    if (!touch) return;
    if (!this.isDragging && this.distanceFromStart(touch.clientX, touch.clientY) > DRAG_THRESHOLD) {
      this.isDragging = true;
      if (this.startTile) {
        this.callbacks.onTileDragStart?.(this.startTile);
      }
    }
    if (this.isDragging) {
      const tile = screenToTile(touch.clientX, touch.clientY, this.canvas, this.tileSize);
      this.callbacks.onTileDragMove?.(tile);
    }
  };

  private handleTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    if (!this.isPointerDown) return;
    if (this.isDragging) {
      // Use changedTouches for the final position
      const touch = e.changedTouches[0];
      const tile = touch
        ? screenToTile(touch.clientX, touch.clientY, this.canvas, this.tileSize)
        : this.startTile!;
      this.callbacks.onTileDragEnd?.(tile);
    } else if (this.startTile) {
      this.callbacks.onTileTap(this.startTile);
    }
    this.resetInteraction();
  };

  // ── Mouse Events (fallback for desktop) ─────────────────────────────

  private setupMouseEvents(): void {
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave);
  }

  private handleMouseDown = (e: MouseEvent): void => {
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startTile = screenToTile(e.clientX, e.clientY, this.canvas, this.tileSize);
    this.isPointerDown = true;
    this.isDragging = false;
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (this.isPointerDown) {
      if (!this.isDragging && this.distanceFromStart(e.clientX, e.clientY) > DRAG_THRESHOLD) {
        this.isDragging = true;
        if (this.startTile) {
          this.callbacks.onTileDragStart?.(this.startTile);
        }
      }
      if (this.isDragging) {
        const tile = screenToTile(e.clientX, e.clientY, this.canvas, this.tileSize);
        this.callbacks.onTileDragMove?.(tile);
      }
    } else {
      const tile = screenToTile(e.clientX, e.clientY, this.canvas, this.tileSize);
      this.callbacks.onTileHover?.(tile);
    }
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (!this.isPointerDown) return;
    if (this.isDragging) {
      const tile = screenToTile(e.clientX, e.clientY, this.canvas, this.tileSize);
      this.callbacks.onTileDragEnd?.(tile);
    } else if (this.startTile) {
      this.callbacks.onTileTap(this.startTile);
    }
    this.resetInteraction();
  };

  private handleMouseLeave = (e: MouseEvent): void => {
    if (this.isDragging) {
      const tile = screenToTile(e.clientX, e.clientY, this.canvas, this.tileSize);
      this.callbacks.onTileDragEnd?.(tile);
    }
    this.resetInteraction();
  };

  // ── Shared helpers ──────────────────────────────────────────────────

  private distanceFromStart(clientX: number, clientY: number): number {
    const dx = clientX - this.startX;
    const dy = clientY - this.startY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private resetInteraction(): void {
    this.isPointerDown = false;
    this.isDragging = false;
    this.startTile = null;
  }

  /** Remove all event listeners for clean teardown. */
  destroy(): void {
    if (this.usePointerEvents) {
      this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
      this.canvas.removeEventListener('pointermove', this.handlePointerMove);
      this.canvas.removeEventListener('pointerup', this.handlePointerUp);
      this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    } else {
      this.canvas.removeEventListener('touchstart', this.handleTouchStart);
      this.canvas.removeEventListener('touchmove', this.handleTouchMove);
      this.canvas.removeEventListener('touchend', this.handleTouchEnd);
      this.canvas.removeEventListener('mousedown', this.handleMouseDown);
      this.canvas.removeEventListener('mousemove', this.handleMouseMove);
      this.canvas.removeEventListener('mouseup', this.handleMouseUp);
      this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    }
  }
}
