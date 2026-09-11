import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { APPROVAL_SCENE_CODES, PERMISSIONS } from '@company/constants';
import {
  AUDIT_IN_APPLICATION,
  REQUIRED_PERMISSION,
} from '../../../../../common/security/auth.decorators.js';
import { ApprovalController } from '../approval.controller.js';

const context = { actorId: '7', requestId: 'approval-request', ip: null, userAgent: null };

describe('ApprovalController', () => {
  it('fixes the BOM submission scene at the business entry point', async () => {
    const service = { submit: vi.fn().mockResolvedValue({ id: '1' }) };
    const controller = new ApprovalController(service as never);

    await expect(
      controller.submitBom({ productId: '11' }, { version: 3 }, context),
    ).resolves.toEqual({ id: '1' });
    expect(service.submit).toHaveBeenCalledWith(
      { sceneCode: APPROVAL_SCENE_CODES.bom, subjectId: '11', expectedVersion: 3 },
      context,
    );
  });

  it('keeps independent backend permission gates for configuration, viewing, decisions, and submission', () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, ApprovalController.prototype.scenes)).toBe(
      PERMISSIONS.approval.configure,
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, ApprovalController.prototype.approve)).toBe(
      PERMISSIONS.approval.decide,
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, ApprovalController.prototype.submitBom)).toBe(
      PERMISSIONS.product.products.manageBom,
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ApprovalController.prototype.instances),
    ).toEqual([
      PERMISSIONS.approval.view,
      PERMISSIONS.approval.decide,
      PERMISSIONS.approval.reassign,
      PERMISSIONS.approval.configure,
      PERMISSIONS.product.products.manageBom,
    ]);
    expect(Reflect.getMetadata(AUDIT_IN_APPLICATION, ApprovalController.prototype.approve)).toBe(
      true,
    );
  });

  it('forwards the decision task and comment without adding business logic in the controller', async () => {
    const service = { approve: vi.fn().mockResolvedValue({ status: 'pending' }) };
    const controller = new ApprovalController(service as never);

    await controller.approve({ id: '9' }, { version: 4, taskId: '12', comment: '通过' }, context);

    expect(service.approve).toHaveBeenCalledWith(
      '9',
      { version: 4, taskId: '12', comment: '通过' },
      context,
    );
  });
});
