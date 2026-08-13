import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@company/constants';
import {
  IDEMPOTENT_ENDPOINT,
  REQUIRED_PERMISSION,
} from '../../../../../common/security/auth.decorators.js';
import { CREATE_STEP_REPORT_IDEMPOTENCY_SCOPE } from '../../../application/idempotency/create-step-report-idempotency.contract.js';
import { CORRECT_STEP_REPORT_IDEMPOTENCY_SCOPE } from '../../../application/idempotency/correct-step-report-idempotency.contract.js';
import { ProductionReportingController } from '../production-reporting.controller.js';

describe('ProductionReportingController contract', () => {
  it('uses separate read, employee report and administrator correction permissions', () => {
    const prototype = ProductionReportingController.prototype;
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, prototype.getBatchExecution)).toBe(
      PERMISSIONS.production.tasks.view,
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, prototype.listExecutionBatches)).toBe(
      PERMISSIONS.production.tasks.view,
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, prototype.createReport)).toBe(
      PERMISSIONS.production.steps.report,
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, prototype.reverseReport)).toBe(
      PERMISSIONS.production.steps.manageExecution,
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, prototype.correctReport)).toBe(
      PERMISSIONS.production.steps.manageExecution,
    );
  });

  it('enables versioned HTTP idempotency only for create and correct', () => {
    const prototype = ProductionReportingController.prototype;
    expect(Reflect.getMetadata(IDEMPOTENT_ENDPOINT, prototype.createReport)).toEqual({
      scope: CREATE_STEP_REPORT_IDEMPOTENCY_SCOPE,
    });
    expect(Reflect.getMetadata(IDEMPOTENT_ENDPOINT, prototype.correctReport)).toEqual({
      scope: CORRECT_STEP_REPORT_IDEMPOTENCY_SCOPE,
    });
    expect(Reflect.getMetadata(IDEMPOTENT_ENDPOINT, prototype.reverseReport)).toBeUndefined();
    expect(Reflect.getMetadata(PATH_METADATA, prototype.createReport)).toBe(
      'batches/:batchId/step-records/:recordId/reports',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, prototype.createReport)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(PATH_METADATA, prototype.listExecutionBatches)).toBe(
      'execution-batches',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, prototype.listExecutionBatches)).toBe(
      RequestMethod.GET,
    );
  });

  it('forwards the same normalized DTO object to the application service', async () => {
    const service = { createReport: vi.fn().mockResolvedValue({ report: { reportId: '1' } }) };
    const controller = new ProductionReportingController(service as never);
    const body = { version: 2, normalQuantity: 3, abnormalQuantity: 1, remark: null };
    const context = {
      actorId: '7',
      requestId: 'r1',
      idempotencyKey: 'key',
      ip: null,
      userAgent: null,
    };
    await controller.createReport({ batchId: '1', recordId: '9' }, body, context);
    expect(service.createReport).toHaveBeenCalledWith('1', '9', body, context);
  });
});
