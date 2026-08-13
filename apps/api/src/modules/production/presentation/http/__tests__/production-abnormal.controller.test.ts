import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@company/constants';
import {
  IDEMPOTENT_ENDPOINT,
  REQUIRED_PERMISSION,
} from '../../../../../common/security/auth.decorators.js';
import { ProductionAbnormalController } from '../production-abnormal.controller.js';

describe('ProductionAbnormalController', () => {
  it('separates abnormal approval from assigned rework execution', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        ProductionAbnormalController.prototype.approveRework,
      ),
    ).toBe(PERMISSIONS.production.steps.manageAbnormal);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionAbnormalController.prototype.startRework),
    ).toBe(PERMISSIONS.production.rework.execute);
  });

  it('only enables HTTP idempotency for rework completion', () => {
    const approve = ProductionAbnormalController.prototype.approveRework;
    const complete = ProductionAbnormalController.prototype.completeRework;
    expect(Reflect.getMetadata(PATH_METADATA, approve)).toBe(
      'abnormal-dispositions/:dispositionId/actions/approve-rework',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, approve)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(IDEMPOTENT_ENDPOINT, approve)).toBeUndefined();
    expect(Reflect.getMetadata(IDEMPOTENT_ENDPOINT, complete)).toEqual({
      scope: 'production.rework.complete.v1',
    });
  });
});
