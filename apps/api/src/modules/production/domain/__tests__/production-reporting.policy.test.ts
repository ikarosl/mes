import { describe, expect, it } from 'vitest';
import {
  requireAbnormalOrigin,
  requireDirectReportQuantities,
  requireReportQuantities,
  requireReportWithinUpperLimit,
} from '../production-reporting.policy.js';

describe('production reporting policy', () => {
  it('accepts a split report within the unified report limit', () => {
    expect(() => requireReportQuantities(3, 1)).not.toThrow();
    expect(() => requireReportWithinUpperLimit('3.0000', 3, 1, '7.0000')).not.toThrow();
  });

  it('rejects empty and excessive quantities', () => {
    expect(() => requireReportQuantities(0, 0)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
    expect(() => requireReportWithinUpperLimit('4', 2, 2, '7')).toThrowError(
      expect.objectContaining({ code: 'STEP_REPORT_QUANTITY_EXCEEDED' }),
    );
    expect(() => requireReportWithinUpperLimit(0, 8, 2, 9)).toThrowError(
      expect.objectContaining({ code: 'STEP_REPORT_QUANTITY_EXCEEDED' }),
    );
  });

  it('requires employee direct normal and abnormal reports to be submitted separately', () => {
    expect(() => requireDirectReportQuantities(3, 0)).not.toThrow();
    expect(() => requireDirectReportQuantities(0, 2)).not.toThrow();
    expect(() => requireDirectReportQuantities(3, 2)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  });

  it('rejects a previous-step abnormal origin for the first route step', () => {
    expect(requireAbnormalOrigin(2, 'current_step', false)).toBe('current_step');
    expect(requireAbnormalOrigin(2, 'previous_step', true)).toBe('previous_step');
    expect(() => requireAbnormalOrigin(2, 'previous_step', false)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT', message: '首道工序不能上报前置工序异常' }),
    );
  });
});
