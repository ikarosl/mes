import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { APPROVAL_SCENE_CODES, PERMISSIONS } from '@company/constants';
import type { UserProfile } from '@company/contracts';
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
      PERMISSIONS.approval.configure,
      PERMISSIONS.product.products.manageBom,
      PERMISSIONS.production.materials.correctDemand,
      PERMISSIONS.production.tasks.terminate,
      PERMISSIONS.production.tasks.manageOutput,
    ]);
    expect(Reflect.getMetadata(AUDIT_IN_APPLICATION, ApprovalController.prototype.approve)).toBe(
      true,
    );
  });

  it('forwards the current node and version with trimmed decision text', async () => {
    const service = { approve: vi.fn().mockResolvedValue({ status: 'pending' }) };
    const controller = new ApprovalController(service as never);

    await controller.approve(
      { id: '9' },
      { version: 4, stepId: '12', comment: '  通过  ' },
      context,
    );

    expect(service.approve).toHaveBeenCalledWith(
      '9',
      { version: 4, stepId: '12', comment: '通过' },
      context,
    );
  });

  it.each(['roleOptions', 'userOptions', 'flow', 'saveDraft', 'publish'] as const)(
    'requires configure permission for %s independently',
    (method) => {
      expect(Reflect.getMetadata(REQUIRED_PERMISSION, ApprovalController.prototype[method])).toBe(
        PERMISSIONS.approval.configure,
      );
    },
  );

  it.each(['approve', 'reject'] as const)(
    'requires decide permission and transactional audit for %s',
    (method) => {
      expect(Reflect.getMetadata(REQUIRED_PERMISSION, ApprovalController.prototype[method])).toBe(
        PERMISSIONS.approval.decide,
      );
      expect(Reflect.getMetadata(AUDIT_IN_APPLICATION, ApprovalController.prototype[method])).toBe(
        true,
      );
    },
  );

  it.each([
    { permissions: [PERMISSIONS.approval.view], global: false },
    { permissions: [PERMISSIONS.approval.decide], global: false },
    { permissions: [PERMISSIONS.product.products.manageBom], global: false },
    { permissions: ['approval:reassign'], global: false },
    { permissions: [PERMISSIONS.approval.configure], global: true },
    { permissions: ['approval:*'], global: true },
    { permissions: ['*'], global: true },
  ])(
    'derives global visibility from authenticated permissions $permissions',
    async ({ permissions, global }) => {
      const service = { listInstances: vi.fn(), getInstance: vi.fn() };
      const controller = new ApprovalController(service as never);
      const user: UserProfile = {
        id: '7',
        username: 'reviewer',
        displayName: '审批人',
        roles: ['admin'],
        permissions,
      };
      await controller.instances({ scope: 'all', page: 2, pageSize: 5 }, user);
      await controller.instance({ id: '9' }, user);
      expect(service.listInstances).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'all', page: 2, pageSize: 5 }),
        '7',
        global,
      );
      expect(service.getInstance).toHaveBeenCalledWith('9', '7', global);
    },
  );

  it('returns eligible user options through the approval application capability', async () => {
    const users = [{ id: '18', displayName: '指定审批人' }];
    const service = { listUserOptions: vi.fn().mockResolvedValue(users) };
    await expect(new ApprovalController(service as never).userOptions()).resolves.toEqual(users);
  });
});
