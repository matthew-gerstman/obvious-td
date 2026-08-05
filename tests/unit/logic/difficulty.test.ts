import { describe, it, expect } from 'vitest';
import {
  applyDifficultyHP,
  getScalingRate,
  getStartingGold,
  getStartingLives,
} from '../../../src/logic/difficulty';
import { loadDifficultyMode } from './test-helpers';

describe('Difficulty', () => {
  const easy = loadDifficultyMode('easy');
  const medium = loadDifficultyMode('medium');
  const hard = loadDifficultyMode('hard');

  it('applyDifficultyHP scales by hpMultiplier', () => {
    expect(applyDifficultyHP(100, easy)).toBe(70);
    expect(applyDifficultyHP(100, medium)).toBe(100);
    expect(applyDifficultyHP(100, hard)).toBe(150);
  });

  it('getScalingRate returns hpScalingRate', () => {
    expect(getScalingRate(easy)).toBe(1.10);
    expect(getScalingRate(medium)).toBe(1.15);
    expect(getScalingRate(hard)).toBe(1.20);
  });

  it('getStartingGold returns startingGold', () => {
    expect(getStartingGold(easy)).toBe(200);
    expect(getStartingGold(medium)).toBe(150);
    expect(getStartingGold(hard)).toBe(100);
  });

  it('getStartingLives returns startingLives', () => {
    expect(getStartingLives(easy)).toBe(20);
    expect(getStartingLives(medium)).toBe(15);
    expect(getStartingLives(hard)).toBe(10);
  });
});

