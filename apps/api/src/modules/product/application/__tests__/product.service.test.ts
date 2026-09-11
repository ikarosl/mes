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
  it('cleans and forwards material master CRUD plus options and product groups', async () => {
    const materials = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 }),
      listOptions: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: '9' }),
      update: vi.fn().mockResolvedValue(undefined),
      setStatus: vi.fn().mockResolvedValue(undefined),
    };
    const catalog = {
      listProductGroups: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 }),
    };
    const service = new ProductService(
      {} as never,
      {} as never,
      catalog as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      materials as never,
    );
    const input = {
      materialCode: ' M-1 ',
      materialName: ' 微带 ',
      categoryId: '3',
      unit: ' pcs ',
      acquireMethod: 'purchased' as const,
      specValues: [
        { key: ' 阻抗 ', value: ' 50 ', unit: ' ohm ' },
        { key: ' ', value: '丢弃' },
      ],
      status: 1,
      remark: ' 说明 ',
    };
    const cleaned = {
      ...input,
      materialCode: 'M-1',
      materialName: '微带',
      unit: 'pcs',
      specValues: [{ key: '阻抗', value: '50', unit: 'ohm' }],
      remark: '说明',
    };

    await expect(service.createMaterial(input, audit)).resolves.toEqual({ id: '9' });
    await service.updateMaterial('9', input, audit);
    await service.setMaterialStatus('9', 0, audit);
    await service.listMaterialMasterData({ page: 2, pageSize: 20, status: 1 });
    await service.listMaterialOptions();
    await service.listProductGroups({ page: 1, pageSize: 10, keyword: '微带' });

    expect(materials.create).toHaveBeenCalledWith(cleaned, audit);
    expect(materials.update).toHaveBeenCalledWith('9', cleaned, audit);
    expect(materials.setStatus).toHaveBeenCalledWith('9', 0, audit);
    expect(materials.list).toHaveBeenCalledWith({ page: 2, pageSize: 20, status: 1 });
    expect(materials.listOptions).toHaveBeenCalledOnce();
    expect(catalog.listProductGroups).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      keyword: '微带',
    });
  });

  it('uses materialId for exact-version lookup and trims version creation input', async () => {
    const materialVariants = {
      listEnabledByMaterials: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: '12', variantCode: 'M-1-1-0' }),
    };
    const service = new ProductService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      materialVariants as never,
      {} as never,
    );

    await service.listMaterialVariantsByMaterial('9');
    await service.createMaterialVariant(
      { materialId: '9', majorVersion: ' 1 ', minorVersion: ' 0 ', remark: ' 备注 ' },
      audit,
    );

    expect(materialVariants.listEnabledByMaterials).toHaveBeenCalledWith(['9']);
    expect(materialVariants.create).toHaveBeenCalledWith(
      { materialId: '9', majorVersion: '1', minorVersion: '0', remark: '备注' },
      audit,
    );
  });

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

  it('removes a stored SOP when database attachment fails', async () => {
    const repository = { attachProcessStepSop: vi.fn().mockRejectedValue(new Error('db failed')) };
    const stored = {
      storageProvider: 's3',
      bucket: 'technical-files',
      objectKey: 'sop/2026/file.pdf',
    };
    const storage = {
      storeSop: vi.fn().mockResolvedValue(stored),
      remove: vi.fn().mockResolvedValue(undefined),
    };
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

    await expect(
      service.uploadProcessStepSop(
        '2',
        {
          originalName: 'SOP.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('file'),
        },
        audit,
      ),
    ).rejects.toThrow('db failed');
    expect(storage.remove).toHaveBeenCalledWith(stored);
  });

  it('soft-deletes a technical file without touching object storage', async () => {
    const repository = { deleteTechnicalFile: vi.fn().mockResolvedValue(undefined) };
    const storage = { remove: vi.fn() };
    const service = new ProductService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      storage as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.deleteTechnicalFile('2', audit);

    expect(repository.deleteTechnicalFile).toHaveBeenCalledWith('2', audit);
    expect(storage.remove).not.toHaveBeenCalled();
  });

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
