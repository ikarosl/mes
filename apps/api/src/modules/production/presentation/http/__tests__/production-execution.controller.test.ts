import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@company/constants';
import {
  IDEMPOTENT_ENDPOINT,
  REQUIRED_PERMISSION,
} from '../../../../../common/security/auth.decorators.js';
import { ProductionExecutionController } from '../production-execution.controller.js';

describe('ProductionExecutionController permissions', () => {
  it('separates administrator assignment from employee start', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionExecutionController.prototype.assign),
    ).toBe(PERMISSIONS.production.steps.assign);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionExecutionController.prototype.unassign),
    ).toBe(PERMISSIONS.production.steps.assign);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionExecutionController.prototype.reassign),
    ).toBe(PERMISSIONS.production.steps.assign);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionExecutionController.prototype.start),
    ).toBe(PERMISSIONS.production.steps.start);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionExecutionController.prototype.myTasks),
    ).toBe(PERMISSIONS.production.workerTasks.view);
  });

  it('exposes semantic POST routes and does not enable HTTP idempotency', () => {
    const start = ProductionExecutionController.prototype.start;
    expect(Reflect.getMetadata(PATH_METADATA, start)).toBe(
      'batches/:batchId/step-records/:recordId/actions/start',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, start)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(IDEMPOTENT_ENDPOINT, start)).toBeUndefined();

    const complete = ProductionExecutionController.prototype.completeExecution;
    expect(Reflect.getMetadata(PATH_METADATA, complete)).toBe(
      'batches/:batchId/actions/complete-execution',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, complete)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, complete)).toBe(
      PERMISSIONS.production.steps.manageExecution,
    );
    expect(Reflect.getMetadata(IDEMPOTENT_ENDPOINT, complete)).toBeUndefined();
  });

  it('forwards authenticated actor and version to the application service', async () => {
    const service = { startStep: vi.fn().mockResolvedValue({ stepStatus: 'doing' }) };
    const controller = new ProductionExecutionController(service as never);
    const context = { actorId: '7', requestId: 'r1', ip: null, userAgent: null };
    await expect(
      controller.start({ batchId: '1', recordId: '9' }, { version: 2 }, context),
    ).resolves.toEqual({ stepStatus: 'doing' });
    expect(service.startStep).toHaveBeenCalledWith('1', '9', 2, context);
  });
});
