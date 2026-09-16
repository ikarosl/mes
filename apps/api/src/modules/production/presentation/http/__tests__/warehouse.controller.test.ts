import 'reflect-metadata';
import { PERMISSIONS } from '@company/constants';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_IN_APPLICATION,
  IDEMPOTENT_ENDPOINT,
  REQUIRED_PERMISSION,
} from '../../../../../common/security/auth.decorators.js';
import { ProductionMaterialLossController } from '../production-material-loss.controller.js';
import { ProductionReturnController } from '../production-return.controller.js';
import { ProductionStockCheckController } from '../production-stock-check.controller.js';

describe('Production warehouse controller contracts', () => {
  it('uses page permissions for reads and independent action permissions for writes', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionReturnController.prototype.listReturns),
    ).toBe(PERMISSIONS.warehouse.returns.view);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        ProductionMaterialLossController.prototype.listMaterialLosses,
      ),
    ).toBe(PERMISSIONS.warehouse.scraps.view);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        ProductionMaterialLossController.prototype.createMaterialLoss,
      ),
    ).toBe(PERMISSIONS.warehouse.scraps.create);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        ProductionMaterialLossController.prototype.confirmMaterialLoss,
      ),
    ).toBe(PERMISSIONS.warehouse.scraps.confirm);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionReturnController.prototype.createReturn),
    ).toBe(PERMISSIONS.warehouse.returns.create);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionReturnController.prototype.confirmReturn),
    ).toBe(PERMISSIONS.warehouse.returns.confirm);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        ProductionStockCheckController.prototype.stockCheckCandidates,
      ),
    ).toBe(PERMISSIONS.warehouse.stockChecks.view);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        ProductionStockCheckController.prototype.saveStockCheckCounts,
      ),
    ).toBe(PERMISSIONS.warehouse.stockChecks.count);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        ProductionStockCheckController.prototype.completeStockCheck,
      ),
    ).toBe(PERMISSIONS.warehouse.stockChecks.complete);
  });

  it('uses versioned idempotency scopes for loss creation and confirmation', () => {
    expect(
      Reflect.getMetadata(
        IDEMPOTENT_ENDPOINT,
        ProductionMaterialLossController.prototype.createMaterialLoss,
      ),
    ).toEqual({ scope: 'production.material-loss.create.v1' });
    expect(
      Reflect.getMetadata(
        IDEMPOTENT_ENDPOINT,
        ProductionMaterialLossController.prototype.confirmMaterialLoss,
      ),
    ).toEqual({ scope: 'production.material-loss.confirm.v1' });
    expect(
      Reflect.getMetadata(
        IDEMPOTENT_ENDPOINT,
        ProductionMaterialLossController.prototype.cancelMaterialLoss,
      ),
    ).toBeUndefined();
  });

  it('marks every business write as application-audited', () => {
    for (const handler of [
      ProductionReturnController.prototype.createReturn,
      ProductionMaterialLossController.prototype.createMaterialLoss,
      ProductionMaterialLossController.prototype.confirmMaterialLoss,
      ProductionMaterialLossController.prototype.cancelMaterialLoss,
      ProductionReturnController.prototype.confirmReturn,
      ProductionReturnController.prototype.cancelReturn,
      ProductionStockCheckController.prototype.createStockCheck,
      ProductionStockCheckController.prototype.saveStockCheckCounts,
      ProductionStockCheckController.prototype.completeStockCheck,
      ProductionStockCheckController.prototype.cancelStockCheck,
    ]) {
      expect(Reflect.getMetadata(AUDIT_IN_APPLICATION, handler)).toBe(true);
    }
  });
});
