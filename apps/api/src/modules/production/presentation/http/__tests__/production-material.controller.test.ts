import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@company/constants';
import {
  IDEMPOTENT_ENDPOINT,
  REQUIRED_PERMISSION,
} from '../../../../../common/security/auth.decorators.js';
import { CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE } from '../../../application/idempotency/create-material-allocation-idempotency.contract.js';
import { CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from '../../../application/idempotency/create-material-outbound-idempotency.contract.js';
import { CONFIRM_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from '../../../application/idempotency/confirm-material-outbound-idempotency.contract.js';
import { ProductionMaterialController } from '../production-material.controller.js';

describe('ProductionMaterialController permissions', () => {
  it('uses independent read, allocation, and outbound permissions', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionMaterialController.prototype.demands),
    ).toBe(PERMISSIONS.production.materials.view);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionMaterialController.prototype.allocate),
    ).toBe(PERMISSIONS.production.materials.allocate);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionMaterialController.prototype.outbound),
    ).toBe(PERMISSIONS.production.materials.outbound);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        ProductionMaterialController.prototype.confirmOutbound,
      ),
    ).toBe(PERMISSIONS.production.materials.confirmOutbound);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        ProductionMaterialController.prototype.cancelOutbound,
      ),
    ).toBe(PERMISSIONS.production.materials.cancelOutbound);
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
