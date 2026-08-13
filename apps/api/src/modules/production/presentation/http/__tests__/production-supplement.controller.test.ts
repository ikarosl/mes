import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@company/constants';
import {
  IDEMPOTENT_ENDPOINT,
  REQUIRED_PERMISSION,
} from '../../../../../common/security/auth.decorators.js';
import { ProductionSupplementController } from '../production-supplement.controller.js';

describe('ProductionSupplementController', () => {
  it('protects candidates and approval with abnormal-management permission', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionSupplementController.prototype.candidates),
    ).toBe(PERMISSIONS.production.steps.manageAbnormal);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionSupplementController.prototype.approve),
    ).toBe(PERMISSIONS.production.steps.manageAbnormal);
  });

  it('enables the registered idempotency scope for the fact-creating approval', () => {
    const approve = ProductionSupplementController.prototype.approve;
    expect(Reflect.getMetadata(PATH_METADATA, approve)).toBe(
      ':dispositionId/actions/approve-scrap-supplement',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, approve)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(IDEMPOTENT_ENDPOINT, approve)).toEqual({
      scope: 'production.abnormal.scrap-supplement.v1',
    });
  });
});
