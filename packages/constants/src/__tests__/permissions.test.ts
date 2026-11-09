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
    expect(PRODUCT_ITEM_KINDS).toEqual(['material', 'finished_product']);
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
      correctDemand: 'production:materials:correct-demand',
    });
    expect(ALLOCATION_STATUS_LABELS.released).toBe('已释放');
  });

  // TODO(production-tracking-permissions): 验证生产执行与异常写命令独立鉴权；高重要性，旧派工及返工权限已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按追踪卡和现场人员权限边界恢复。

  // TODO(production-tracking-permissions): 验证生产执行与异常写命令独立鉴权；高重要性，旧派工及返工权限已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按追踪卡和现场人员权限边界恢复。

  // TODO(production-tracking-trace-access): 验证追踪历史独立鉴权；高重要性，旧综合追溯权限已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按追踪卡权限恢复。

  it('uses a dedicated read-only inventory permission', () => {
    expect(PERMISSIONS.warehouse.inventory.view).toBe('warehouse:inventory:view');
  });

  it('separates warehouse return and stock-check commands', () => {
    expect(PERMISSIONS.warehouse.returns).toEqual({
      view: 'warehouse:returns:view',
      create: 'warehouse:returns:create',
      confirm: 'warehouse:returns:confirm',
      cancel: 'warehouse:returns:cancel',
    });
    expect(PERMISSIONS.warehouse.stockChecks).toEqual({
      view: 'warehouse:stock-checks:view',
      create: 'warehouse:stock-checks:create',
      count: 'warehouse:stock-checks:count',
      complete: 'warehouse:stock-checks:complete',
      cancel: 'warehouse:stock-checks:cancel',
    });
  });
});
