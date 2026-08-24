import { describe, expect, it, vi } from 'vitest';
import { ProductionDomainError } from '../../../domain/production.errors.js';
import { ProductionDomainExceptionFilter } from '../production-domain-exception.filter.js';

const invoke = (exception: ProductionDomainError) => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const setHeader = vi.fn();
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        originalUrl: '/api/production/batches/6',
        headers: { 'x-request-id': 'request_1234' },
      }),
      getResponse: () => ({ status, setHeader }),
    }),
  };

  new ProductionDomainExceptionFilter().catch(exception, host as never);
  return { json, status, setHeader };
};

describe('ProductionDomainExceptionFilter', () => {
  it.each([
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['CONCURRENT_MODIFICATION', 409],
    ['INVALID_INPUT', 400],
    ['INVALID_STATE', 400],
    ['STEP_ASSIGNMENT_CONFLICT', 409],
    ['STEP_START_NOT_ALLOWED', 409],
    ['STEP_COMPLETION_NOT_ALLOWED', 409],
    ['NOT_STEP_ASSIGNEE', 403],
    ['SOP_SNAPSHOT_UNAVAILABLE', 503],
  ] as const)('maps %s to the expected HTTP envelope', (code, expectedStatus) => {
    const { json, status, setHeader } = invoke(new ProductionDomainError(code, '生产业务错误'));

    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'request_1234');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: expectedStatus,
        code,
        message: '生产业务错误',
        requestId: 'request_1234',
        path: '/api/production/batches/6',
        timestamp: expect.stringMatching(/\+08:00$/),
      }),
    );
  });

  it('preserves structured conflict details for actionable clients', () => {
    const details = {
      conflictingStepRecordId: '9',
      conflictingStepOrder: 2,
      conflictingStepName: '装配',
      downstreamEffectiveReportedQuantity: '10.0000',
      correctedUpstreamNormalQuantity: '9.0000',
    };
    const { json } = invoke(
      new ProductionDomainError('DOWNSTREAM_QUANTITY_CONFLICT', '下游数量冲突', details),
    );

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ details }));
  });
});
