import { describe, expect, it, vi } from 'vitest';
import { ProductDomainError } from '../../domain/product.errors.js';
import { ApprovalSubjectError } from '../../../approval/public.js';
import { ProductBomApprovalHandler } from '../product-bom-approval.handler.js';

const audit = { actorId: '7', requestId: 'bom-request', ip: null, userAgent: null };

describe('ProductBomApprovalHandler', () => {
  // TODO(bom-json-table-evidence): 验证注册、版本 3 完整表格冻结和展示投影、拒绝旧版本及畸形表格，且不联动模板修改；高重要性，旧版本 2 数组证据夹具失效且正式测试暂缓；获正式测试授权后恢复。

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
