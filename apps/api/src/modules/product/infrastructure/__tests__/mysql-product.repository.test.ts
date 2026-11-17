import { describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { ProductDomainError } from '../../domain/product.errors.js';
import { MysqlProcessRouteRepository } from '../mysql-process-route.repository.js';
import { MysqlProcessStepRepository } from '../mysql-process-step.repository.js';
import { MysqlProductCatalogRepository } from '../mysql-product-catalog.repository.js';
import { MysqlProductCategoryRepository } from '../mysql-product-category.repository.js';

const commandContext: CommandContext = {
  actorId: '1',
  requestId: 'req-1',
  ip: '127.0.0.1',
  userAgent: null,
};
const commandContextWithoutIp: CommandContext = { ...commandContext, ip: null };

describe('MySQL product adapters workflow transactions', () => {
  // TODO(attachment-historical-locator): 验证停用或软删除后的历史 SOP 仍按冻结文件身份读取真实存储定位；高重要性：历史对象保留与安全读取，Product 文件仓储已迁至 Attachment 且正式测试暂缓；获正式测试授权后按 Attachment 历史读取及 Production 下载契约恢复。

  it('returns product form options with stable identity', async () => {
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
    const repository = new MysqlProductCatalogRepository(
      { query } as never,
      {} as never,
      {} as never,
    );

    await expect(repository.listProductOptions()).resolves.toEqual([
      {
        id: '9',
        itemCode: 'FG-1',
        productName: '成品',
        acquireMethod: 'self_made',
        unit: 'pcs',
      },
    ]);
    expect(String(query.mock.calls[0]?.[0])).not.toContain('p.default_route_id');
  });

  // TODO(product-list-bom-evidence): 验证成品列表保留 BOM 永久锁定依据且规格书元数据不改变分页；高重要性，旧查询夹具缺少本次新增的规格书列与读取分支，正式测试暂缓；获正式测试授权后恢复现行列表契约覆盖。

  it('rejects every BOM replacement after the product has been locked by approval', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      query: vi.fn().mockResolvedValue([
        [
          {
            id: 9,
            item_code: 'FG-1',
            product_name: '成品',
            category_id: 3,
            item_kind: 'finished_product',
            acquire_method: 'self_made',
            status: 1,
            default_route_id: null,
            unit: 'pcs',
            bom_status: 'approved',
            version: 0,
            bom_locked_at: new Date('2026-08-28T02:00:00Z'),
          },
        ],
        [],
      ]),
      execute: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    const repository = new MysqlProductCatalogRepository(
      { getConnection: vi.fn().mockResolvedValue(connection) } as never,
      {} as never,
      {} as never,
    );

    await expect(
      repository.replaceMaterials('9', { version: 0, items: [] }, commandContext),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('永久锁定'),
    });
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('returns a stable server-paginated route list', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 0 }], []])
      .mockResolvedValueOnce([[], []]);
    const repository = new MysqlProcessRouteRepository({ query } as never, {} as never);

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
    const repository = new MysqlProcessStepRepository(
      { query } as never,
      { getManyTechnicalFiles: vi.fn().mockResolvedValue([]) } as never,
      {} as never,
    );

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
        [{ id: 2, step_code: 'GX-1', step_name: '切割', default_sop_file_id: 6 }],
        [],
      ]);
    const repository = new MysqlProcessStepRepository(
      { query } as never,
      {
        getManyTechnicalFiles: vi
          .fn()
          .mockResolvedValue([{ id: '6', fileType: 'sop', fileName: 'cut.pdf' }]),
      } as never,
      {} as never,
    );

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
          version_no: 'V1',
          status: 'enabled',
        },
      ],
      [],
    ]);
    const repository = new MysqlProcessRouteRepository({ query } as never, {} as never);

    await expect(repository.listRouteOptions()).resolves.toEqual([
      {
        id: '15',
        routeCode: 'R-1',
        routeName: '标准路线',
        versionNo: 'V1',
        status: 'enabled',
      },
    ]);
    expect(String(query.mock.calls[0]?.[0])).toContain("status='enabled'");
  });

  // TODO(attachment-metadata-audit-transaction): 验证附件元数据登记与成功审计同事务提交且失败整体回滚；高重要性：事务原子性，Product 文件仓储已迁至 Attachment 且正式测试暂缓；获正式测试授权后针对 Attachment 上传登记公开能力恢复。

  // TODO(technical-file-reference-retention): 验证存在当前资料或历史 SOP 统一引用时拒绝清理，绑定与清理并发仍保留真实对象；高重要性：历史依据与引用保护，Product 专属删除链已迁至 Attachment 且正式测试暂缓；获正式测试授权后按 Attachment 引用锁及清理生命周期恢复。

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
    const repository = new MysqlProcessRouteRepository(
      { getConnection: vi.fn().mockResolvedValue(connection) } as never,
      {} as never,
    );

    const result = await repository.createRoute(
      {
        routeCode: 'R-1',
        routeName: '标准路线',
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
    const repository = new MysqlProcessRouteRepository(
      { getConnection: vi.fn().mockResolvedValue(connection) } as never,
      {} as never,
    );

    await expect(
      repository.updateRoute(
        '15',
        {
          routeCode: 'R-1',
          routeName: '修改名称',
          versionNo: 'V1',
          remark: null,
        },
        commandContextWithoutIp,
      ),
    ).rejects.toBeInstanceOf(ProductDomainError);
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.execute).not.toHaveBeenCalled();
  });

  // TODO(product-route-step-attachment-snapshot): 验证路线步骤保存时经 Attachment 核验并锁定 SOP 资格，快照、统一引用与成功审计同事务；高重要性：历史执行依据及清理竞态，旧直读文件表的专属夹具已失效且正式测试暂缓；获正式测试授权后按 Attachment 公开资格与引用能力恢复。
});
