import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  PROCESS_ROUTE_STATUSES,
  PRODUCT_ITEM_KINDS,
  TECHNICAL_FILE_STORAGE_PROVIDERS,
  permissionMatches,
} from '../index.js';

describe('permissionMatches', () => {
  it('supports exact and scoped wildcard permissions', () => {
    expect(permissionMatches(['system:*'], 'system:user:view')).toBe(true);
    expect(permissionMatches(['system:user:view'], 'system:user:update')).toBe(false);
    expect(permissionMatches(['*'], 'anything')).toBe(true);
  });

  it('allows a grant when it matches any permission in an any-of set', () => {
    expect(
      permissionMatches(
        ['product:products:view'],
        ['product:products:view', 'product:categories:view'],
      ),
    ).toBe(true);
    expect(
      permissionMatches(
        ['product:categories:view'],
        ['product:products:view', 'product:categories:view'],
      ),
    ).toBe(true);
  });

  it('denies a grant that matches none of the any-of set', () => {
    expect(
      permissionMatches(
        ['product:processes:view'],
        ['product:products:view', 'product:categories:view'],
      ),
    ).toBe(false);
    expect(permissionMatches([], ['product:products:view', 'product:categories:view'])).toBe(false);
  });

  it('applies wildcards inside an any-of set and rejects an empty set', () => {
    expect(permissionMatches(['*'], ['product:products:view', 'product:routes:view'])).toBe(true);
    expect(permissionMatches(['product:*'], ['product:products:view'])).toBe(true);
    expect(permissionMatches(['product:products:view'], [])).toBe(false);
  });

  it('centralizes product workflow status and mutation permission codes', () => {
    expect(PRODUCT_ITEM_KINDS).toEqual(['material', 'semi_finished', 'finished_product']);
    expect(PROCESS_ROUTE_STATUSES).toContain('archived');
    expect(PERMISSIONS.product.products.manageBom).toBe('product:products:manage-bom');
    expect(PERMISSIONS.product.routes.manageSteps).toBe('product:routes:manage-steps');
    expect(PERMISSIONS.product.files.download).toBe('product:files:download');
    expect(TECHNICAL_FILE_STORAGE_PROVIDERS).toEqual(['s3']);
  });
});
