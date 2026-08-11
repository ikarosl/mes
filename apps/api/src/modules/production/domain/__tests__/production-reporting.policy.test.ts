import { describe, expect, it } from 'vitest';
import {
  isRequiredNormalCompleted,
  requireNoDownstreamQuantityConflict,
  requireNormalWithinRequired,
  requireReportQuantities,
} from '../production-reporting.policy.js';

describe('production reporting policy', () => {
  it('accepts a split report and detects exact completion', () => {
    expect(() => requireReportQuantities(3, 1)).not.toThrow();
    expect(() => requireNormalWithinRequired('4.0000', 3, '7.0000')).not.toThrow();
    expect(isRequiredNormalCompleted('7.0000', '7')).toBe(true);
  });

  it('rejects empty, excessive and downstream-conflicting quantities', () => {
    expect(() => requireReportQuantities(0, 0)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
    expect(() => requireNormalWithinRequired('4', 4, '7')).toThrowError(
      expect.objectContaining({ code: 'STEP_REPORT_QUANTITY_EXCEEDED' }),
    );
    expect(() => requireNoDownstreamQuantityConflict('2', '3')).toThrowError(
      expect.objectContaining({ code: 'DOWNSTREAM_QUANTITY_CONFLICT' }),
    );
  });
});
