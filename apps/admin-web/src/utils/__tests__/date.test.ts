import { describe, expect, it } from 'vitest';
import { formatDateForDisplay, formatDateTimeForDisplay, toDateInputValue } from '../date';

describe('date utilities', () => {
  it('converts an API ISO time to a date-picker value without timezone conversion', () => {
    expect(toDateInputValue('2026-07-29T16:00:32.900+08:00')).toBe('2026-07-29');
  });

  it('keeps a date-only value and handles absent or invalid values', () => {
    expect(toDateInputValue('2026-07-29')).toBe('2026-07-29');
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue('invalid-date')).toBe('');
  });

  it('uses a fallback when displaying an absent date', () => {
    expect(formatDateForDisplay('2026-07-29T00:00:00+08:00')).toBe('2026-07-29');
    expect(formatDateForDisplay(undefined)).toBe('-');
  });

  it('formats a full ISO datetime to YYYY-MM-DD HH:mm:ss', () => {
    expect(formatDateTimeForDisplay('2026-07-29T16:00:32.900+08:00')).toBe('2026-07-29 16:00:32');
    expect(formatDateTimeForDisplay('2026-07-29T00:05:01Z')).toBe('2026-07-29 00:05:01');
  });

  it('falls back for absent or invalid datetime values', () => {
    expect(formatDateTimeForDisplay(null)).toBe('-');
    expect(formatDateTimeForDisplay(undefined)).toBe('-');
    expect(formatDateTimeForDisplay('')).toBe('-');
    expect(formatDateTimeForDisplay('2026-07-29')).toBe('-');
  });
});
