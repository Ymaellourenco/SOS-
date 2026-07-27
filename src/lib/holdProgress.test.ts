import { describe, it, expect } from 'vitest';
import { calculateHoldProgress, isHoldComplete } from './holdProgress';

describe('calculateHoldProgress', () => {
  it('returns 0 at the start of the press', () => {
    expect(calculateHoldProgress(0, 600)).toBe(0);
  });

  it('returns 50 at the halfway point', () => {
    expect(calculateHoldProgress(300, 600)).toBe(50);
  });

  it('returns 100 exactly at the configured duration', () => {
    expect(calculateHoldProgress(600, 600)).toBe(100);
  });

  it('clamps to 100 when held past the duration (no overshoot)', () => {
    expect(calculateHoldProgress(5000, 600)).toBe(100);
  });

  it('clamps to 0 for negative elapsed time', () => {
    expect(calculateHoldProgress(-10, 600)).toBe(0);
  });

  it('treats a zero/negative duration as instantly complete rather than dividing by zero', () => {
    expect(calculateHoldProgress(0, 0)).toBe(100);
    expect(calculateHoldProgress(100, -50)).toBe(100);
  });
});

describe('isHoldComplete', () => {
  it('is false before the duration has elapsed', () => {
    expect(isHoldComplete(599, 600)).toBe(false);
  });

  it('is true once the duration has elapsed', () => {
    expect(isHoldComplete(600, 600)).toBe(true);
  });

  it('is true well past the duration', () => {
    expect(isHoldComplete(10000, 600)).toBe(true);
  });
});
