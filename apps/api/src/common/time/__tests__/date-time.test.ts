import { describe, expect, it } from 'vitest';
import { toBeijingCompactTimestamp, toBeijingISOString, toDateOnlyString } from '../date-time.js';

describe('Beijing time formatting', () => {
  it('formats an instant with an explicit UTC+08:00 offset', () => {
    const instant = new Date('2026-07-23T18:23:20.449Z');

    expect(toBeijingISOString(instant)).toBe('2026-07-24T02:23:20.449+08:00');
    expect(toBeijingCompactTimestamp(instant)).toBe('20260724022320');
  });

  it('normalizes database DATE values without leaking a Date or timestamp', () => {
    expect(toDateOnlyString(new Date('2026-07-31T16:00:00.000Z'))).toBe('2026-08-01');
    expect(toDateOnlyString('2026-08-01T00:00:00+08:00')).toBe('2026-08-01');
    expect(toDateOnlyString(null)).toBeNull();
  });
});
