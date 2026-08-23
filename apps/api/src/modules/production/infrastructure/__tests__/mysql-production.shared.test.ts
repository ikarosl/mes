import { describe, expect, it } from 'vitest';
import { multiply } from '../mysql-production.shared.js';

describe('production demand quantity multiplication', () => {
  it('uses integer multiplication and maps fractional or overflowing results to stable input errors', () => {
    expect(multiply('2.0000', '10.0000')).toBe('20.0000');
    expect(() => multiply('1.5000', '10.0000')).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
    expect(() => multiply('99999999.0000', '2.0000')).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  });
});
