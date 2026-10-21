import { describe, expect, it } from 'vitest';
import type { ProductionBatchDetail } from '@company/contracts';
import { CREATE_BATCH_IDEMPOTENCY_SCOPE } from '../production-idempotency-scopes.contract.js';
import { productionBatchResultCodec } from '../production-batch-result.codec.js';

const validDetail: ProductionBatchDetail = {
  id: '1',
  workOrderId: '2',
  workOrderNo: 'WO-001',
  orderType: 'mass_production',
  productId: '3',
  productCode: 'P-001',
  productName: '测试产品',
  batchNo: 'task_batch-001',
  routeId: '4',
  routeCode: 'ROUTE-001',
  routeVersion: 'v1',
  plannedQuantity: '10.0000',
  planStartDate: '2026-08-01',
  planEndDate: '2026-08-31',
  startedAt: null,
  startedById: null,
  startedByName: null,
  status: 'pending',
  closeoutMode: null,
  closeoutVersion: null,
  finalOutput: null,
  currentOutputRevisionId: null,
  executionCompletedAt: null,
  executionCompletedBy: null,
  ownerId: '5',
  ownerName: '张三',
  completedAt: null,
  completedBy: null,
  cancelReason: null,
  cancelledBy: null,
  cancelledByName: null,
  cancelledAt: null,
  remark: null,
  version: 0,
  createdAt: '2026-08-01T00:00:00+08:00',
  updatedAt: '2026-08-01T00:00:00+08:00',
};

describe('productionBatchResultCodec', () => {
  it('codec 与执行契约共用同一 scope（结果结构与契约版本冻结一致，形状变更必须 bump scope）', () => {
    expect(productionBatchResultCodec.scope).toBe(CREATE_BATCH_IDEMPOTENCY_SCOPE);
  });

  it('完整结果可以 encode/decode 往返', () => {
    expect(
      productionBatchResultCodec.decode(productionBatchResultCodec.encode(validDetail)),
    ).toEqual(validDetail);
  });

  // TODO(test-migration): 高重要性：幂等快照校验；正式测试获准后按任务概览和独立工序契约恢复。
  it.todo(
    'canonical 快照语义：decode(JSON.parse(JSON.stringify(encode(全字段富化响应)))) 成功且形状符合对外契约（本 codec 保形，deep 相等原样本）',
  );

  it('缺少 version 时拒绝', () => {
    const { version, ...rest } = validDetail;
    void version;
    expect(() => productionBatchResultCodec.decode(rest)).toThrow();
  });

  it('version 为 string 时拒绝', () => {
    expect(() => productionBatchResultCodec.decode({ ...validDetail, version: '0' })).toThrow();
  });

  it('非法批次状态时拒绝', () => {
    expect(() => productionBatchResultCodec.decode({ ...validDetail, status: 'bogus' })).toThrow();
  });

  // TODO(test-migration): 高重要性：幂等快照校验；正式测试获准后按任务概览和独立工序契约恢复。
  it.todo('stepRecords 不是数组时拒绝');

  // TODO(test-migration): 高重要性：幂等快照校验；正式测试获准后按任务概览和独立工序契约恢复。
  it.todo('工序记录缺少字段时拒绝');

  // TODO(test-migration): 高重要性：幂等快照校验；正式测试获准后按任务概览和独立工序契约恢复。
  it.todo('工序状态非法时拒绝');

  it('存在未知字段时拒绝', () => {
    expect(() => productionBatchResultCodec.decode({ ...validDetail, extra: 'x' })).toThrow();
  });

  it('encode 在结果结构错误时同样拒绝（保存前拦截，而非落库后才发现）', () => {
    expect(() =>
      productionBatchResultCodec.encode({ ...validDetail, version: '0' } as never),
    ).toThrow();
  });
});
