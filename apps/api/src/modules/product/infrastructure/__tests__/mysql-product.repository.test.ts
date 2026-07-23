import { describe, expect, it, vi } from 'vitest';
import { ProductDomainError } from '../../domain/product.errors.js';
import { MysqlProductRepository } from '../mysql-product.repository.js';

describe('MysqlProductRepository workflow transactions', () => {
  it('creates a draft route and audit entry on the same transaction connection', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      query: vi.fn().mockResolvedValue([
        [
          {
            id: 9,
            item_code: 'FG-1',
            product_name: '成品',
            category_id: 2,
            item_kind: 'finished_product',
            acquire_method: 'self_made',
            status: 1,
            default_route_id: null,
          },
        ],
        [],
      ]),
      execute: vi
        .fn()
        .mockResolvedValueOnce([{ insertId: 15, affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ insertId: 100, affectedRows: 1 }, []]),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    const repository = new MysqlProductRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    const result = await repository.createRoute(
      {
        routeCode: 'R-1',
        routeName: '标准路线',
        productId: '9',
        versionNo: 'V1',
        remark: null,
      },
      { userId: '1', ip: '127.0.0.1' },
    );

    expect(result).toEqual({ id: '15' });
    const sql = connection.execute.mock.calls.map(([statement]) => String(statement));
    expect(sql[0]).toContain('status,remark');
    expect(sql[0]).toContain("'draft'");
    expect(sql[1]).toContain('INSERT INTO operation_logs');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('refuses in-place changes to an enabled route version', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      query: vi.fn().mockResolvedValue([
        [
          {
            id: 15,
            route_code: 'R-1',
            route_name: '标准路线',
            product_id: 9,
            version_no: 'V1',
            status: 'enabled',
          },
        ],
        [],
      ]),
      execute: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    const repository = new MysqlProductRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(
      repository.updateRoute(
        '15',
        {
          routeCode: 'R-1',
          routeName: '修改名称',
          productId: '9',
          versionNo: 'V1',
          remark: null,
        },
        { userId: '1', ip: null },
      ),
    ).rejects.toBeInstanceOf(ProductDomainError);
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.execute).not.toHaveBeenCalled();
  });
});
