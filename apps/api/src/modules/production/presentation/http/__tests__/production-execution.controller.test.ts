import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { Readable } from 'node:stream';
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
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        ProductionExecutionController.prototype.completeStep,
      ),
    ).toBe(PERMISSIONS.production.steps.complete);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionExecutionController.prototype.myTasks),
    ).toBe(PERMISSIONS.production.workerTasks.view);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionExecutionController.prototype.taskStepSop),
    ).toBe(PERMISSIONS.production.tasks.view);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        ProductionExecutionController.prototype.myTaskStepSop,
      ),
    ).toBe(PERMISSIONS.production.workerTasks.view);
  });

  it('streams an immutable SOP snapshot and forwards employee identity for worker downloads', async () => {
    const content = {
      file: { fileName: '作业指导书.pdf', mimeType: 'application/pdf', sizeBytes: 12 },
      stream: Readable.from(Buffer.from('snapshot')),
    };
    const service = {
      getStepSopContent: vi.fn().mockResolvedValue(content),
      getMyStepSopContent: vi.fn().mockResolvedValue(content),
    };
    const controller = new ProductionExecutionController(service as never);
    const response = { setHeader: vi.fn() };
    const context = { actorId: '7', requestId: 'r1', ip: null, userAgent: null };

    await controller.taskStepSop({ batchId: '1', recordId: '9' }, response);
    await controller.myTaskStepSop({ batchId: '1', recordId: '9' }, context, response);

    expect(service.getStepSopContent).toHaveBeenCalledWith('1', '9');
    expect(service.getMyStepSopContent).toHaveBeenCalledWith('1', '9', context);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', '12');
  });

  it('exposes semantic POST routes and does not enable HTTP idempotency', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, ProductionExecutionController.prototype.taskStepSop),
    ).toBe('batches/:batchId/step-records/:recordId/sop-content');
    expect(
      Reflect.getMetadata(PATH_METADATA, ProductionExecutionController.prototype.myTaskStepSop),
    ).toBe('worker-tasks/batches/:batchId/step-records/:recordId/sop-content');
    expect(
      Reflect.getMetadata(METHOD_METADATA, ProductionExecutionController.prototype.myTaskStepSop),
    ).toBe(RequestMethod.GET);

    const start = ProductionExecutionController.prototype.start;
    expect(Reflect.getMetadata(PATH_METADATA, start)).toBe(
      'batches/:batchId/step-records/:recordId/actions/start',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, start)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(IDEMPOTENT_ENDPOINT, start)).toBeUndefined();

    const completeStep = ProductionExecutionController.prototype.completeStep;
    expect(Reflect.getMetadata(PATH_METADATA, completeStep)).toBe(
      'batches/:batchId/step-records/:recordId/actions/complete',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, completeStep)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(IDEMPOTENT_ENDPOINT, completeStep)).toBeUndefined();

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
    const service = {
      startStep: vi.fn().mockResolvedValue({ stepStatus: 'doing' }),
      completeStep: vi.fn().mockResolvedValue({ stepStatus: 'completed' }),
    };
    const controller = new ProductionExecutionController(service as never);
    const context = { actorId: '7', requestId: 'r1', ip: null, userAgent: null };
    await expect(
      controller.start({ batchId: '1', recordId: '9' }, { version: 2 }, context),
    ).resolves.toEqual({ stepStatus: 'doing' });
    expect(service.startStep).toHaveBeenCalledWith('1', '9', 2, context);
    await expect(
      controller.completeStep({ batchId: '1', recordId: '9' }, { version: 3 }, context),
    ).resolves.toEqual({ stepStatus: 'completed' });
    expect(service.completeStep).toHaveBeenCalledWith('1', '9', 3, context);
  });
});
