import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  PROCESS_ROUTE_STATUSES,
  PRODUCT_ITEM_KINDS,
  TECHNICAL_FILE_STORAGE_PROVIDERS,
  ALLOCATION_STATUS_LABELS,
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

  it('centralizes production material permissions and labels', () => {
    expect(PERMISSIONS.production.materials).toEqual({
      view: 'production:materials:view',
      allocate: 'production:materials:allocate',
      outbound: 'production:materials:outbound',
      confirmOutbound: 'production:materials:outbound-confirm',
      cancelOutbound: 'production:materials:outbound-cancel',
    });
    expect(ALLOCATION_STATUS_LABELS.released).toBe('已释放');
  });

  it('separates worker task visibility, assignment, and start permissions', () => {
    expect(PERMISSIONS.production.workerTasks.view).toBe('production:worker-tasks:view');
    expect(PERMISSIONS.production.steps.assign).toBe('production:steps:assign');
    expect(PERMISSIONS.production.steps.start).toBe('production:steps:start');
    expect(PERMISSIONS.production.steps.manageExecution).not.toBe(
      PERMISSIONS.production.steps.assign,
    );
  });

  it('uses a dedicated read-only Production trace permission', () => {
    expect(PERMISSIONS.production.trace.view).toBe('production:trace:view');
    expect(PERMISSIONS.production.trace.view).not.toBe(PERMISSIONS.production.tasks.view);
  });
});
