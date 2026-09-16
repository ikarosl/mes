import { describe, expect, it, vi } from 'vitest';
import { ProductDomainError } from '../../domain/product.errors.js';
import { ApprovalSubjectError } from '../../../approval/public.js';
import { ProductBomApprovalHandler } from '../product-bom-approval.handler.js';

const audit = { actorId: '7', requestId: 'bom-request', ip: null, userAgent: null };

const preparation = {
  title: 'FG-1 BOM审批',
  subjectVersion: 4,
  snapshot: {
    productId: '9',
    itemCode: 'FG-1',
    productName: '成品',
    unit: 'pcs',
    specValues: [],
    materials: [
      {
        id: '31',
        materialId: '21',
        itemCode: 'MAT-1',
        quantityPerUnit: '2.0000',
        unit: 'kg',
        remark: null,
      },
    ],
  },
};

describe('ProductBomApprovalHandler', () => {
  it('registers itself and fixes the new evidence schema version at 2', async () => {
    const products = { prepareBomApproval: vi.fn().mockResolvedValue(preparation) };
    const registry = { register: vi.fn() };
    const handler = new ProductBomApprovalHandler(products as never, registry as never);

    handler.onModuleInit();
    await expect(handler.prepareForApproval('9', 4, audit)).resolves.toEqual({
      ...preparation,
      snapshotSchemaVersion: 2,
      businessAssigneeResolutions: [],
    });
    expect(registry.register).toHaveBeenCalledWith(handler);
  });

  it('projects historical schema 1 evidence without leaking removed BOM flags', async () => {
    const products = {
      listMaterialNames: vi.fn().mockResolvedValue({ '21': '当前物料名' }),
    };
    const handler = new ProductBomApprovalHandler(products as never, {} as never);
    const historical = {
      ...preparation.snapshot,
      materials: [
        {
          ...preparation.snapshot.materials[0],
          isKeyMaterial: true,
          needBatchRecord: false,
        },
      ],
    };

    await expect(handler.readSnapshotForDisplay(historical, 1)).resolves.toEqual({
      subjectSnapshot: preparation.snapshot,
      materialNames: { '21': '当前物料名' },
    });
    expect(products.listMaterialNames).toHaveBeenCalledWith(['21']);
  });

  it('rejects malformed or unknown evidence versions before exposing it', async () => {
    const handler = new ProductBomApprovalHandler(
      { listMaterialNames: vi.fn() } as never,
      {} as never,
    );

    await expect(handler.readSnapshotForDisplay(preparation.snapshot, 3)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(
      handler.readSnapshotForDisplay({ ...preparation.snapshot, materials: [{}] }, 2),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('maps Product domain errors to the public subject error contract', async () => {
    const products = {
      bindBomApproval: vi
        .fn()
        .mockRejectedValue(new ProductDomainError('CONFLICT', 'BOM 审批关联已变化')),
      finalizeBomApproval: vi
        .fn()
        .mockRejectedValue(new ProductDomainError('NOT_FOUND', '成品不存在')),
      restoreBomAfterApprovalEnd: vi
        .fn()
        .mockRejectedValue(new ProductDomainError('INVALID_MATERIAL', 'BOM 不可用')),
    };
    const handler = new ProductBomApprovalHandler(products as never, {} as never);

    await expect(handler.bindApproval('9', '1', 4, audit)).rejects.toEqual(
      new ApprovalSubjectError('CONFLICT', 'BOM 审批关联已变化'),
    );
    await expect(handler.finalizeApproval('9', '1', 5, audit)).rejects.toEqual(
      new ApprovalSubjectError('NOT_FOUND', '成品不存在'),
    );
    await expect(handler.restoreAfterApprovalEnd('9', '1', 5, audit)).rejects.toEqual(
      new ApprovalSubjectError('INVALID_INPUT', 'BOM 不可用'),
    );
  });
});
