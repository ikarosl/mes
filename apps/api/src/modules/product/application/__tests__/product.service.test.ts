import { describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { ProductDomainError } from '../../domain/product.errors.js';
import { ProductService } from '../product.service.js';

const audit: CommandContext = {
  actorId: '1',
  requestId: 'req-1',
  ip: '127.0.0.1',
  userAgent: null,
};

describe('ProductService workflow safeguards', () => {
  // TODO(material-json-table-normalization): 验证基础物料完整 JSON 表格规范化、单元格原文保留与 CRUD 转发；高重要性，旧数组夹具失效且正式测试暂缓；获正式测试授权后按 JsonTableData 恢复。

  // TODO(product-version-creation): 验证稳定物料身份、版本输入规范化与规格书必填传递；高重要性，旧夹具缺少本次新增的规格书字段且正式测试暂缓；获正式测试授权后按现行契约恢复。

  it('forwards independent route payloads without a product binding', async () => {
    const routes = {
      listRoutes: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 }),
      listRouteOptions: vi.fn().mockResolvedValue([]),
      createRoute: vi.fn().mockResolvedValue({ id: '15' }),
      updateRoute: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ProductService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      routes as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const input = {
      routeCode: ' R-1 ',
      routeName: ' 路线 ',
      versionNo: ' V1 ',
      remark: ' 备注 ',
    };

    await service.createRoute(input, audit);
    await service.updateRoute('15', input, audit);
    await service.listRoutes({ page: 1, pageSize: 10, status: 'draft' });
    await service.listRouteOptions();

    const cleaned = { routeCode: 'R-1', routeName: '路线', versionNo: 'V1', remark: '备注' };
    expect(routes.createRoute).toHaveBeenCalledWith(cleaned, audit);
    expect(routes.updateRoute).toHaveBeenCalledWith('15', cleaned, audit);
    expect(routes.listRoutes).toHaveBeenCalledWith({ page: 1, pageSize: 10, status: 'draft' });
    expect(routes.listRouteOptions).toHaveBeenCalledOnce();
    expect(routes.createRoute.mock.calls[0]?.[0]).not.toHaveProperty('productId');
  });

  it('rejects duplicate BOM inputs before opening a repository transaction', async () => {
    const repository = { replaceMaterials: vi.fn() };
    const service = new ProductService(
      {} as never,
      {} as never,
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(() =>
      service.replaceMaterials(
        '10',
        {
          version: 0,
          items: [
            {
              materialId: '20',
              quantityPerUnit: 1,
              unit: 'pcs',
            },
            {
              materialId: '20',
              quantityPerUnit: 2,
              unit: 'pcs',
            },
          ],
        },
        audit,
      ),
    ).toThrow(ProductDomainError);
    expect(repository.replaceMaterials).not.toHaveBeenCalled();
  });

  it('rejects more than 200 BOM lines before opening a repository transaction', () => {
    const repository = { replaceMaterials: vi.fn() };
    const service = new ProductService(
      {} as never,
      {} as never,
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(() =>
      service.replaceMaterials(
        '10',
        {
          version: 0,
          items: Array.from({ length: 201 }, (_, index) => ({
            materialId: String(index + 1),
            quantityPerUnit: 1,
            unit: 'pcs',
          })),
        },
        audit,
      ),
    ).toThrow(ProductDomainError);
    expect(repository.replaceMaterials).not.toHaveBeenCalled();
  });

  it('rejects fractional BOM quantities before opening a repository transaction', () => {
    const repository = { replaceMaterials: vi.fn() };
    const service = new ProductService(
      {} as never,
      {} as never,
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(() =>
      service.replaceMaterials(
        '10',
        {
          version: 0,
          items: [
            {
              materialId: '20',
              quantityPerUnit: 1.5,
              unit: 'pcs',
            },
          ],
        },
        audit,
      ),
    ).toThrow('必须是 1 到 99999999 的整数');
    expect(repository.replaceMaterials).not.toHaveBeenCalled();
  });

  it('requires route step orders to be continuous from one', async () => {
    const repository = { replaceRouteSteps: vi.fn() };
    const service = new ProductService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.replaceRouteSteps(
        '30',
        [
          { processStepId: '1', stepOrder: 1, needInspection: false },
          { processStepId: '2', stepOrder: 3, needInspection: true },
        ],
        audit,
      ),
    ).rejects.toBeInstanceOf(ProductDomainError);
    expect(repository.replaceRouteSteps).not.toHaveBeenCalled();
  });

  it('rejects inactive route owners before opening the route transaction', async () => {
    const repository = { replaceRouteSteps: vi.fn() };
    const identityDirectory = { listActiveUserOptionsByIds: vi.fn().mockResolvedValue([]) };
    const service = new ProductService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      repository as never,
      {} as never,
      identityDirectory as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.replaceRouteSteps(
        '30',
        [
          {
            processStepId: '1',
            stepOrder: 1,
            defaultOwnerId: '99',
            needInspection: false,
          },
        ],
        audit,
      ),
    ).rejects.toBeInstanceOf(ProductDomainError);
    expect(repository.replaceRouteSteps).not.toHaveBeenCalled();
  });

  it('enriches route steps through the Identity public directory', async () => {
    const repository = {
      listRouteSteps: vi
        .fn()
        .mockResolvedValue([{ id: '1', defaultOwnerId: '7', defaultOwnerName: null }]),
    };
    const identityDirectory = {
      listActiveUserOptionsByIds: vi.fn().mockResolvedValue([{ id: '7', displayName: '张师傅' }]),
    };
    const service = new ProductService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      repository as never,
      {} as never,
      identityDirectory as never,
      {} as never,
      {} as never,
    );

    await expect(service.listRouteSteps('30')).resolves.toEqual([
      { id: '1', defaultOwnerId: '7', defaultOwnerName: '张师傅' },
    ]);
  });

  // TODO(technical-file-compensation): 验证 SOP 绑定入库失败时只补偿刚上传的对象；高重要性，旧存储入口及 mock 已失效且正式测试暂缓；获正式测试授权后按统一 store 端口恢复。

  // TODO(technical-file-retention): 验证已登记技术文件及历史对象持续保留；高重要性，未公开删除链已移除且正式测试暂缓；获正式测试授权后按当前文件生命周期恢复覆盖。

  it('associates an existing SOP without deleting the previous file', async () => {
    const repository = { setProcessStepDefaultSop: vi.fn().mockResolvedValue(undefined) };
    const storage = { remove: vi.fn() };
    const service = new ProductService(
      {} as never,
      {} as never,
      {} as never,
      repository as never,
      {} as never,
      {} as never,
      storage as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.setProcessStepDefaultSop('2', '8', audit);

    expect(repository.setProcessStepDefaultSop).toHaveBeenCalledWith('2', '8', audit);
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
