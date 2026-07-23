import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  PROCESS_ROUTE_STATUSES,
  PRODUCT_ITEM_KINDS,
  permissionMatches,
} from '../index.js';

describe('permissionMatches', () => {
  it('supports exact and scoped wildcard permissions', () => {
    expect(permissionMatches(['system:*'], 'system:user:view')).toBe(true);
    expect(permissionMatches(['system:user:view'], 'system:user:update')).toBe(false);
    expect(permissionMatches(['*'], 'anything')).toBe(true);
  });

  it('centralizes product workflow status and mutation permission codes', () => {
    expect(PRODUCT_ITEM_KINDS).toEqual(['material', 'semi_finished', 'finished_product']);
    expect(PROCESS_ROUTE_STATUSES).toContain('archived');
    expect(PERMISSIONS.product.products.manageBom).toBe('product:products:manage-bom');
    expect(PERMISSIONS.product.routes.manageSteps).toBe('product:routes:manage-steps');
  });
});
