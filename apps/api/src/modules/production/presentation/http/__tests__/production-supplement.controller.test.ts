import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@company/constants';
import {
  AUDIT_IN_APPLICATION,
  IDEMPOTENT_ENDPOINT,
  REQUIRED_PERMISSION,
} from '../../../../../common/security/auth.decorators.js';
import { CONFIRM_SCRAP_SUPPLEMENT_PLAN_IDEMPOTENCY_SCOPE } from '../../../application/idempotency/production-idempotency-scopes.contract.js';
import { ProductionSupplementController } from '../production-supplement.controller.js';

describe('ProductionSupplementController', () => {
  it('mounts the supplement routes under the abnormal-dispositions prefix', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ProductionSupplementController)).toBe(
      'production/abnormal-dispositions',
    );
  });

  it('protects every supplement route with abnormal-management permission', () => {
    for (const method of ['candidates', 'getPlan', 'savePlan', 'confirmPlan'] as const) {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION, ProductionSupplementController.prototype[method]),
      ).toBe(PERMISSIONS.production.steps.manageAbnormal);
    }
  });

  it('exposes candidates and plan reads as GET and draft save as PUT under the plan path', () => {
    const { candidates, getPlan, savePlan } = ProductionSupplementController.prototype;
    expect(Reflect.getMetadata(PATH_METADATA, candidates)).toBe(
      ':dispositionId/supplement-candidates',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, candidates)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, getPlan)).toBe(
      ':dispositionId/scrap-supplement-plan',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, getPlan)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, savePlan)).toBe(
      ':dispositionId/scrap-supplement-plan',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, savePlan)).toBe(RequestMethod.PUT);
  });

  it('registers confirmation as a POST action under the plan path with the idempotency scope', () => {
    const { confirmPlan } = ProductionSupplementController.prototype;
    expect(Reflect.getMetadata(PATH_METADATA, confirmPlan)).toBe(
      ':dispositionId/scrap-supplement-plan/actions/confirm',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, confirmPlan)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(IDEMPOTENT_ENDPOINT, confirmPlan)).toEqual({
      scope: CONFIRM_SCRAP_SUPPLEMENT_PLAN_IDEMPOTENCY_SCOPE,
    });
  });

  it('audits draft save and confirmation but not reads', () => {
    const { candidates, getPlan, savePlan, confirmPlan } = ProductionSupplementController.prototype;
    expect(Reflect.getMetadata(AUDIT_IN_APPLICATION, savePlan)).toBe(true);
    expect(Reflect.getMetadata(AUDIT_IN_APPLICATION, confirmPlan)).toBe(true);
    expect(Reflect.getMetadata(AUDIT_IN_APPLICATION, candidates)).toBeUndefined();
    expect(Reflect.getMetadata(AUDIT_IN_APPLICATION, getPlan)).toBeUndefined();
    expect(Reflect.getMetadata(IDEMPOTENT_ENDPOINT, savePlan)).toBeUndefined();
  });

  it('no longer exposes the direct-approve route', () => {
    expect(ProductionSupplementController.prototype).not.toHaveProperty('approve');
  });
});
