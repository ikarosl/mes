import { describe, expect, it } from 'vitest';
import { toBeijingCompactTimestamp, toBeijingISOString } from '../beijing-time.js';

describe('Beijing time formatting', () => {
  it('formats an instant with an explicit UTC+08:00 offset', () => {
    const instant = new Date('2026-07-23T18:23:20.449Z');

    expect(toBeijingISOString(instant)).toBe('2026-07-24T02:23:20.449+08:00');
    expect(toBeijingCompactTimestamp(instant)).toBe('20260724022320');
  });
});
