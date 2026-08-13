import { describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { ProductDomainError } from '../../domain/product.errors.js';
import { MysqlProcessRouteRepository } from '../mysql-process-route.repository.js';
import { MysqlProcessRouteStepRepository } from '../mysql-process-route-step.repository.js';
import { MysqlProcessStepRepository } from '../mysql-process-step.repository.js';
import { MysqlProductCatalogRepository } from '../mysql-product-catalog.repository.js';
import { MysqlProductCategoryRepository } from '../mysql-product-category.repository.js';
import { MysqlTechnicalFileRepository } from '../mysql-technical-file.repository.js';

const commandContext: CommandContext = {
  actorId: '1',
  requestId: 'req-1',
  ip: '127.0.0.1',
  userAgent: null,
};
const commandContextWithoutIp: CommandContext = { ...commandContext, ip: null };

describe('MySQL product adapters workflow transactions', () => {
  it('includes the configured default route in product form options', async () => {
    const query = vi.fn().mockResolvedValue([
      [
        {
          id: 9,
          item_code: 'FG-1',
          product_name: '成品',
          item_kind: 'finished_product',
          acquire_method: 'self_made',
          unit: 'pcs',
          default_route_id: 15,
        },
      ],
      [],
    ]);
    const repository = new MysqlProductCatalogRepository({ query } as never);

    await expect(repository.listProductOptions()).resolves.toEqual([
      {
        id: '9',
        itemCode: 'FG-1',
        productName: '成品',
        itemKind: 'finished_product',
        acquireMethod: 'self_made',
        unit: 'pcs',
        defaultRouteId: '15',
      },
    ]);
    expect(String(query.mock.calls[0]?.[0])).toContain('p.default_route_id');
  });

  it('returns a stable server-paginated route list', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 0 }], []])
      .mockResolvedValueOnce([[], []]);
    const repository = new MysqlProcessRouteRepository({ query } as never);

    await expect(
      repository.listRoutes({ page: 2, pageSize: 10, keyword: 'R-', status: 'draft' }),
    ).resolves.toEqual({ items: [], total: 0, page: 2, pageSize: 10 });
    expect(String(query.mock.calls[1]?.[0])).toContain('ORDER BY r.created_at DESC,r.id DESC');
    expect(query.mock.calls[1]?.[1]).toEqual(['%R-%', '%R-%', 'draft', 10, 10]);
  });

  it('returns a stable server-paginated category list', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 3 }], []])
      .mockResolvedValueOnce([[], []]);
    const repository = new MysqlProductCategoryRepository({ query } as never);

    await expect(
      repository.listCategories({ page: 2, pageSize: 10, categoryCode: 'MAT', status: 1 }),
    ).resolves.toEqual({ items: [], total: 3, page: 2, pageSize: 10 });
    expect(String(query.mock.calls[1]?.[0])).toContain('ORDER BY item_kind,category_code,id');
    expect(query.mock.calls[1]?.[1]).toEqual(['%MAT%', 1, 10, 10]);
  });

  it('returns enabled categories as minimal options', async () => {
    const query = vi
      .fn()
      .mockResolvedValue([
        [{ id: 1, category_code: 'MAT', category_name: '电子物料', item_kind: 'material' }],
        [],
      ]);
    const repository = new MysqlProductCategoryRepository({ query } as never);

    await expect(repository.listCategoryOptions()).resolves.toEqual([
      { id: '1', categoryCode: 'MAT', categoryName: '电子物料', itemKind: 'material' },
    ]);
    expect(String(query.mock.calls[0]?.[0])).toContain('status=1');
  });

  it('returns a stable server-paginated process step list', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 0 }], []])
      .mockResolvedValueOnce([[], []]);
    const repository = new MysqlProcessStepRepository({ query } as never);

    await expect(
      repository.listProcessSteps({ page: 1, pageSize: 10, keyword: 'GX', status: 1 }),
    ).resolves.toEqual({ items: [], total: 0, page: 1, pageSize: 10 });
    expect(String(query.mock.calls[1]?.[0])).toContain('ORDER BY ps.step_code,ps.id');
    expect(query.mock.calls[1]?.[1]).toEqual(['%GX%', '%GX%', 1, 10, 0]);
  });

  it('returns enabled process steps as minimal options', async () => {
    const query = vi
      .fn()
      .mockResolvedValue([
        [{ id: 2, step_code: 'GX-1', step_name: '切割', sop_file_name: 'cut.pdf' }],
        [],
      ]);
    const repository = new MysqlProcessStepRepository({ query } as never);

    await expect(repository.listProcessStepOptions()).resolves.toEqual([
      { id: '2', stepCode: 'GX-1', stepName: '切割', sopFileName: 'cut.pdf' },
    ]);
    expect(String(query.mock.calls[0]?.[0])).toContain('status=1');
  });

  it('returns enabled routes as minimal options', async () => {
    const query = vi.fn().mockResolvedValue([
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
    ]);
    const repository = new MysqlProcessRouteRepository({ query } as never);

    await expect(repository.listRouteOptions()).resolves.toEqual([
      {
        id: '15',
        routeCode: 'R-1',
        routeName: '标准路线',
        productId: '9',
        versionNo: 'V1',
        status: 'enabled',
      },
    ]);
    expect(String(query.mock.calls[0]?.[0])).toContain("status='enabled'");
  });

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
    const repository = new MysqlTechnicalFileRepository({
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
        commandContext,
      ),
    ).resolves.toEqual({ id: '21' });

    expect(String(connection.execute.mock.calls[0]?.[0])).toContain('technical_files');
    expect(String(connection.execute.mock.calls[1]?.[0])).toContain('operation_logs');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('does not delete a technical file while it is referenced', async () => {
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
    const repository = new MysqlTechnicalFileRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(
      repository.deleteTechnicalFile('21', commandContextWithoutIp),
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
    const repository = new MysqlProcessRouteRepository({
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
      commandContext,
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
    const repository = new MysqlProcessRouteRepository({
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
        commandContextWithoutIp,
      ),
    ).rejects.toBeInstanceOf(ProductDomainError);
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.execute).not.toHaveBeenCalled();
  });

  it('allows a non-default enabled route to be disabled', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([
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
      ])
      .mockResolvedValueOnce([[], []]);
    connection.execute.mockResolvedValue([{ affectedRows: 1 }, []]);
    const repository = new MysqlProcessRouteRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(
      repository.setRouteStatus('15', 'disabled', commandContextWithoutIp),
    ).resolves.toBeUndefined();

    expect(String(connection.query.mock.calls[1]?.[0])).toContain('default_route_id');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('refuses to disable a route that is still configured as a product default', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([
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
      ])
      .mockResolvedValueOnce([[{ id: 9 }], []]);
    const repository = new MysqlProcessRouteRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(
      repository.setRouteStatus('15', 'disabled', commandContextWithoutIp),
    ).rejects.toMatchObject({ code: 'DEFAULT_ROUTE_IN_USE' });
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('locks a selected SOP before persisting a route-step snapshot', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([
        [
          {
            id: 15,
            route_code: 'R-1',
            route_name: '标准路线',
            product_id: 9,
            version_no: 'V1',
            status: 'draft',
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([
        [
          {
            step_code: 'CUT',
            step_name: '切割',
            description: null,
            default_sop_file_id: null,
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([
        [{ file_name: 'cut.pdf', object_key: 'sop/cut.pdf', version_no: 'V2' }],
        [],
      ])
      .mockResolvedValueOnce([[{ id: 41 }], []]);
    connection.execute.mockResolvedValue([{ affectedRows: 1 }, []]);
    const repository = new MysqlProcessRouteStepRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await repository.replaceRouteSteps(
      '15',
      [
        {
          processStepId: '7',
          stepOrder: 1,
          sopFileId: '6',
          needInspection: false,
          needRecord: true,
          productMaterialIds: [],
        },
      ],
      commandContextWithoutIp,
    );

    expect(String(connection.query.mock.calls[3]?.[0])).toContain('FOR UPDATE');
    expect(String(connection.execute.mock.calls[1]?.[0])).toContain('sop_version_no_snapshot');
    expect(connection.execute.mock.calls[1]?.[1]).toContain('V2');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('locks a default-route candidate before locking and updating its product', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[{ product_id: 9, status: 'enabled' }], []])
      .mockResolvedValueOnce([
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
      ]);
    connection.execute.mockResolvedValue([{ affectedRows: 1 }, []]);
    const repository = new MysqlProductCatalogRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await repository.setDefaultRoute('9', '15', commandContextWithoutIp);

    expect(String(connection.query.mock.calls[0]?.[0])).toContain('FOR UPDATE');
    expect(String(connection.query.mock.calls[1]?.[0])).toContain('FROM products');
    expect(connection.commit).toHaveBeenCalledOnce();
  });
});

const transactionConnection = () => ({
  beginTransaction: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
});
