import { describe, expect, it } from 'vitest';
import type { BatchStepRecordItem, ProductionBatchDetail } from '@company/contracts';
import { CREATE_BATCH_IDEMPOTENCY_SCOPE } from '../create-batch-idempotency.contract.js';
import { productionBatchResultCodec } from '../production-batch-result.codec.js';

const validStepRecord: BatchStepRecordItem = {
  id: '6',
  productionBatchId: '1',
  routeStepId: '7',
  stepOrder: 1,
  stepCode: 'OP10',
  stepName: '下料',
  defaultSopFileId: null,
  defaultSopFileName: null,
  defaultSopVersionNo: null,
  actualSopFileId: null,
  actualSopFileName: null,
  actualSopVersionNo: null,
  defaultResponsibleUserId: null,
  defaultResponsibleUserName: null,
  responsibleUserId: null,
  responsibleUserName: null,
  needRecord: true,
  needInspection: false,
  status: 'pending',
  startedAt: null,
  completedAt: null,
  outputQuantity: '0.0000',
  qualifiedQuantity: '0.0000',
  abnormalQuantity: '0.0000',
  reworkQuantity: '0.0000',
  unit: 'pcs',
  remark: null,
  version: 0,
};

const validDetail: ProductionBatchDetail = {
  id: '1',
  workOrderId: '2',
  workOrderNo: 'WO-001',
  productId: '3',
  productCode: 'P-001',
  productName: '测试产品',
  batchNo: 'task_batch-001',
  routeId: '4',
  routeCode: 'ROUTE-001',
  routeVersion: 'v1',
  plannedQuantity: '10.0000',
  completedQuantity: '0.0000',
  qualifiedQuantity: '0.0000',
  planStartDate: '2026-08-01',
  planEndDate: '2026-08-31',
  startedAt: null,
  status: 'pending',
  ownerId: '5',
  ownerName: '张三',
  completedAt: null,
  completedBy: null,
  remark: null,
  version: 0,
  createdAt: '2026-08-01T00:00:00+08:00',
  updatedAt: '2026-08-01T00:00:00+08:00',
  stepRecords: [validStepRecord],
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

  it('canonical 快照语义：decode(JSON.parse(JSON.stringify(encode(全字段富化响应)))) 成功且形状符合对外契约（本 codec 保形，deep 相等原样本）', () => {
    // 代表 createBatch 富化后最完整的响应形状：所有可空字段均非空、用户名富化、ISO 日期字符串、
    // 多条已完成工序记录（含 SOP 引用与数量快照），覆盖 schema 全部字段。
    const enrichedStepRecord: BatchStepRecordItem = {
      ...validStepRecord,
      stepOrder: 2,
      stepCode: 'OP20',
      stepName: '装配',
      defaultSopFileId: 'sop-1',
      defaultSopFileName: '装配 SOP.pdf',
      defaultSopVersionNo: 'v3',
      actualSopFileId: 'sop-2',
      actualSopFileName: '装配 SOP 修订版.pdf',
      actualSopVersionNo: 'v3.1',
      defaultResponsibleUserId: '9',
      defaultResponsibleUserName: '李四',
      responsibleUserId: '10',
      responsibleUserName: '王五',
      needInspection: true,
      status: 'completed',
      startedAt: '2026-08-01T09:00:00+08:00',
      completedAt: '2026-08-01T11:30:00+08:00',
      outputQuantity: '8.0000',
      qualifiedQuantity: '7.0000',
      abnormalQuantity: '1.0000',
      reworkQuantity: '0.0000',
      remark: '首件检验合格',
      version: 3,
    };
    const enrichedDetail: ProductionBatchDetail = {
      ...validDetail,
      completedQuantity: '8.0000',
      qualifiedQuantity: '8.0000',
      startedAt: '2026-08-01T08:00:00+08:00',
      completedAt: '2026-08-05T18:30:00+08:00',
      completedBy: '张三',
      remark: '加急',
      stepRecords: [validStepRecord, enrichedStepRecord],
    };

    const encoded = productionBatchResultCodec.encode(enrichedDetail);
    expect(productionBatchResultCodec.decode(encoded)).toEqual(enrichedDetail);
    // executor 存储路径为 JSON.stringify(encoded) 后入库、读取时再解析，业务 codec 必须经受该
    // JSON 往返：decode(JSON.parse(JSON.stringify(encode(sample)))) 成功且形状符合对外契约
    expect(productionBatchResultCodec.decode(JSON.parse(JSON.stringify(encoded)))).toEqual(
      enrichedDetail,
    );
  });

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

  it('stepRecords 不是数组时拒绝', () => {
    expect(() =>
      productionBatchResultCodec.decode({ ...validDetail, stepRecords: 'oops' }),
    ).toThrow();
  });

  it('工序记录缺少字段时拒绝', () => {
    const { id, ...rest } = validStepRecord;
    void id;
    expect(() =>
      productionBatchResultCodec.decode({ ...validDetail, stepRecords: [rest] }),
    ).toThrow();
  });

  it('工序状态非法时拒绝', () => {
    expect(() =>
      productionBatchResultCodec.decode({
        ...validDetail,
        stepRecords: [{ ...validStepRecord, status: 'bogus' }],
      }),
    ).toThrow();
  });

  it('存在未知字段时拒绝', () => {
    expect(() => productionBatchResultCodec.decode({ ...validDetail, extra: 'x' })).toThrow();
  });

  it('encode 在结果结构错误时同样拒绝（保存前拦截，而非落库后才发现）', () => {
    expect(() =>
      productionBatchResultCodec.encode({ ...validDetail, version: '0' } as never),
    ).toThrow();
  });
});
