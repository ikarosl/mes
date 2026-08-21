import 'reflect-metadata';
import { PERMISSIONS } from '@company/constants';
import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENT_ENDPOINT,
  REQUIRED_PERMISSION,
} from '../../../../../common/security/auth.decorators.js';
import { CONFIRM_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE } from '../../../application/idempotency/production-idempotency-scopes.contract.js';
import { CREATE_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE } from '../../../application/idempotency/production-idempotency-scopes.contract.js';
import { ProductionInboundController } from '../production-inbound.controller.js';

describe('ProductionInboundController contract', () => {
  it('uses independent inbound and inventory permissions', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionInboundController.prototype.list),
    ).toBe(PERMISSIONS.production.inbounds.view);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionInboundController.prototype.create),
    ).toBe(PERMISSIONS.production.inbounds.create);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionInboundController.prototype.confirm),
    ).toBe(PERMISSIONS.production.inbounds.confirm);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionInboundController.prototype.cancel),
    ).toBe(PERMISSIONS.production.inbounds.cancel);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionInboundController.prototype.inventory),
    ).toBe(PERMISSIONS.production.inventory.view);
  });

  it('enables HTTP idempotency only for create and confirm', () => {
    expect(
      Reflect.getMetadata(IDEMPOTENT_ENDPOINT, ProductionInboundController.prototype.create),
    ).toEqual({ scope: CREATE_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE });
    expect(
      Reflect.getMetadata(IDEMPOTENT_ENDPOINT, ProductionInboundController.prototype.confirm),
    ).toEqual({ scope: CONFIRM_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE });
    expect(
      Reflect.getMetadata(IDEMPOTENT_ENDPOINT, ProductionInboundController.prototype.cancel),
    ).toBeUndefined();
  });
});
