import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@company/constants';
import {
  IDEMPOTENT_ENDPOINT,
  REQUIRED_PERMISSION,
} from '../../../../../common/security/auth.decorators.js';
import { CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE } from '../../../application/idempotency/production-idempotency-scopes.contract.js';
import { CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from '../../../application/idempotency/production-idempotency-scopes.contract.js';
import { CONFIRM_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from '../../../application/idempotency/production-idempotency-scopes.contract.js';
import { ProductionMaterialController } from '../production-material.controller.js';

describe('ProductionMaterialController permissions', () => {
  it('uses independent read, allocation, and outbound permissions', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionMaterialController.prototype.demands),
    ).toEqual([
      PERMISSIONS.production.materials.view,
      PERMISSIONS.production.tasks.view,
      PERMISSIONS.production.materialDemands.view,
    ]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionMaterialController.prototype.allocate),
    ).toBe(PERMISSIONS.production.materials.allocate);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionMaterialController.prototype.outbound),
    ).toBe(PERMISSIONS.warehouse.outbound.create);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        ProductionMaterialController.prototype.confirmOutbound,
      ),
    ).toBe(PERMISSIONS.warehouse.outbound.confirm);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        ProductionMaterialController.prototype.cancelOutbound,
      ),
    ).toBe(PERMISSIONS.warehouse.outbound.cancel);
  });

  it('binds allocation and outbound to their versioned idempotency scopes', () => {
    expect(
      Reflect.getMetadata(IDEMPOTENT_ENDPOINT, ProductionMaterialController.prototype.allocate),
    ).toEqual({ scope: CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE });
    expect(
      Reflect.getMetadata(IDEMPOTENT_ENDPOINT, ProductionMaterialController.prototype.outbound),
    ).toEqual({ scope: CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE });
    expect(
      Reflect.getMetadata(
        IDEMPOTENT_ENDPOINT,
        ProductionMaterialController.prototype.confirmOutbound,
      ),
    ).toEqual({ scope: CONFIRM_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE });
  });
});
