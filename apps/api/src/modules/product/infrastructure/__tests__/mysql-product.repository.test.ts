import { describe, expect, it, vi } from 'vitest';
import { ProductDomainError } from '../../domain/product.errors.js';
import { MysqlProductRepository } from '../mysql-product.repository.js';

describe('MysqlProductRepository workflow transactions', () => {
  it('persists technical file metadata and audit in the same transaction', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      query: vi.fn(),
      execute: vi
        .fn()
        .mockResolvedValueOnce([{ insertId: 21, affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ insertId: 101, affectedRows: 1 }, []]),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    const repository = new MysqlProductRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(
      repository.createTechnicalFile(
        {
          fileName: 'SOP.pdf',
          originalName: 'SOP.pdf',
          storageProvider: 's3',
          bucket: 'technical-files',
          objectKey: 'sop/2026/07/file.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 10,
          checksumSha256: 'a'.repeat(64),
          fileType: 'sop',
          versionNo: '202607240001',
        },
        { userId: '1', ip: '127.0.0.1' },
      ),
    ).resolves.toEqual({ id: '21' });

    expect(String(connection.execute.mock.calls[0]?.[0])).toContain('technical_files');
    expect(String(connection.execute.mock.calls[1]?.[0])).toContain('operation_logs');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('does not prepare deletion while a technical file is referenced', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              file_name: 'SOP.pdf',
              storage_provider: 's3',
              bucket: 'technical-files',
              object_key: 'sop/file.pdf',
              status: 1,
            },
          ],
          [],
        ])
        .mockResolvedValueOnce([[{ total: 1 }], []]),
      execute: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    const repository = new MysqlProductRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(
      repository.prepareTechnicalFileDelete('21', { userId: '1', ip: null }),
    ).rejects.toBeInstanceOf(ProductDomainError);
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

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
