import 'reflect-metadata';
import { PERMISSIONS } from '@company/constants';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_IN_APPLICATION,
  REQUIRED_PERMISSION,
} from '../../../../../common/security/auth.decorators.js';
import { WarehouseController } from '../warehouse.controller.js';

describe('WarehouseController contract', () => {
  it('uses page permissions for reads and independent action permissions for writes', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, WarehouseController.prototype.listReturns),
    ).toBe(PERMISSIONS.warehouse.returns.view);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, WarehouseController.prototype.createReturn),
    ).toBe(PERMISSIONS.warehouse.returns.create);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, WarehouseController.prototype.confirmReturn),
    ).toBe(PERMISSIONS.warehouse.returns.confirm);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, WarehouseController.prototype.stockCheckCandidates),
    ).toBe(PERMISSIONS.warehouse.stockChecks.view);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, WarehouseController.prototype.saveStockCheckCounts),
    ).toBe(PERMISSIONS.warehouse.stockChecks.count);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, WarehouseController.prototype.completeStockCheck),
    ).toBe(PERMISSIONS.warehouse.stockChecks.complete);
  });

  it('marks every business write as application-audited', () => {
    for (const method of [
      'createReturn',
      'confirmReturn',
      'cancelReturn',
      'createStockCheck',
      'saveStockCheckCounts',
      'completeStockCheck',
      'cancelStockCheck',
    ] as const) {
      expect(Reflect.getMetadata(AUDIT_IN_APPLICATION, WarehouseController.prototype[method])).toBe(
        true,
      );
    }
  });
});
