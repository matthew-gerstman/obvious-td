export interface GameLoopOptions {
  fixedTimeStep?: number;
}

/**
 * Deterministic fixed-timestep game loop with interpolated rendering.
 *
 * The simulation updates at a fixed interval (default 1/60s) regardless of
 * frame rate. The render callback receives an interpolation alpha (0–1)
 * representing how far between the previous and next fixed update we are.
 *
 * Uses the standard accumulator pattern with spiral-of-death protection:
 * if the accumulator exceeds 200ms the excess time is dropped.
 */
export class GameLoop {
  private update: (dt: number) => void;
  private render: (alpha: number) => void;
  private fixedTimeStep: number;
  private accumulator: number = 0;
  private lastTime: number = 0;
  private tickCount: number = 0;
  private speed: number = 1;
  private running: boolean = false;
  private paused: boolean = false;
  private rafId: number | null = null;
  private readonly maxAccumulator: number;

  constructor(
    update: (dt: number) => void,
    render: (alpha: number) => void,
    options?: GameLoopOptions,
  ) {
    this.update = update;
    this.render = render;
    this.fixedTimeStep = options?.fixedTimeStep ?? 1 / 60;
    this.maxAccumulator = 0.2; // 200ms spiral-of-death protection
  }

  /** Begin the loop using requestAnimationFrame. Resets tick count. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.accumulator = 0;
    this.tickCount = 0;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  /** Cancel the animation frame and stop the loop. */
  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /** Pause without resetting state. */
  pause(): void {
    this.paused = true;
  }

  /** Resume after a pause. Resets lastTime to avoid an accumulator spike. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.lastTime = performance.now();
  }

  /** Set the speed multiplier (e.g. 2 for fast-forward). */
  setSpeed(multiplier: number): void {
    this.speed = multiplier;
  }

  /** Return the current tick count (for deterministic testing). */
  getTickCount(): number {
    return this.tickCount;
  }

  /**
   * Manually advance N ticks without rendering (headless testing).
   * Runs update() synchronously — no requestAnimationFrame needed.
   * Respects the current speed multiplier.
   */
  step(count?: number): void {
    const n = count ?? 1;
    const totalTicks = Math.round(n * this.speed);
    for (let i = 0; i < totalTicks; i++) {
      this.update(this.fixedTimeStep);
      this.tickCount++;
    }
  }

  private loop = (): void => {
    if (!this.running) return;

    const now = performance.now();
    const frameTime = (now - this.lastTime) / 1000; // seconds
    this.lastTime = now;

    if (!this.paused) {
      this.accumulator += frameTime * this.speed;

      // Spiral-of-death: clamp accumulator to prevent endless catch-up
      if (this.accumulator > this.maxAccumulator) {
        this.accumulator = this.maxAccumulator;
      }

      while (this.accumulator >= this.fixedTimeStep) {
        this.update(this.fixedTimeStep);
        this.accumulator -= this.fixedTimeStep;
        this.tickCount++;
      }
    }

    // Interpolation alpha: how far between the previous and next fixed update
    const alpha = this.accumulator / this.fixedTimeStep;
    this.render(alpha);

    this.rafId = requestAnimationFrame(this.loop);
  };
}
