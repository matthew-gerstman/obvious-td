import { describe, it, expect } from 'vitest';
import { GameLoop } from '../../src/engine/game-loop';

describe('GameLoop', () => {
  it('step(n) advances exactly n ticks', () => {
    let ticks = 0;
    const loop = new GameLoop(() => { ticks++; }, () => {});
    loop.step(10);
    expect(loop.getTickCount()).toBe(10);
    expect(ticks).toBe(10);
  });

  it('step() with no argument advances exactly 1 tick', () => {
    const loop = new GameLoop(() => {}, () => {});
    loop.step();
    expect(loop.getTickCount()).toBe(1);
  });

  it('update callback receives the correct fixed time step value', () => {
    let receivedDt = 0;
    const loop = new GameLoop((dt) => { receivedDt = dt; }, () => {});
    loop.step();
    expect(receivedDt).toBeCloseTo(1 / 60, 10);
  });

  it('update callback receives a custom fixed time step', () => {
    let receivedDt = 0;
    const loop = new GameLoop((dt) => { receivedDt = dt; }, () => {}, {
      fixedTimeStep: 1 / 30,
    });
    loop.step();
    expect(receivedDt).toBeCloseTo(1 / 30, 10);
  });

  it('setSpeed(2) doubles the effective tick rate', () => {
    const loop = new GameLoop(() => {}, () => {});
    loop.setSpeed(2);
    loop.step(10);
    // 10 steps at 2x speed = 20 ticks worth of game time
    expect(loop.getTickCount()).toBe(20);
  });

  it('pause() and resume() preserve tick count', () => {
    const loop = new GameLoop(() => {}, () => {});
    loop.step(10);
    expect(loop.getTickCount()).toBe(10);

    loop.pause();
    expect(loop.getTickCount()).toBe(10);

    loop.resume();
    expect(loop.getTickCount()).toBe(10);

    loop.step(5);
    expect(loop.getTickCount()).toBe(15);
  });
});
