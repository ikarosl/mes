import { describe, expect, it } from 'vitest';
import type { CreateProductionBatchPayload } from '@company/contracts';
import { normalizeCreateBatchPayload } from '../normalize-create-batch-payload.js';

const base: CreateProductionBatchPayload = { plannedQuantity: 10 };

describe('normalizeCreateBatchPayload', () => {
  it('去掉 batchNo 与 remark 的首尾空白', () => {
    expect(
      normalizeCreateBatchPayload({
        plannedQuantity: 10,
        batchNo: '  ABC-001  ',
        remark: ' 测试 ',
      }),
    ).toEqual({
      plannedQuantity: 10,
      batchNo: 'ABC-001',
      remark: '测试',
    });
  });

  it('空串、纯空白串与缺省字段统一归一化为 null', () => {
    expect(normalizeCreateBatchPayload({ ...base, batchNo: '' }).batchNo).toBe(null);
    expect(normalizeCreateBatchPayload({ ...base, batchNo: '   ' }).batchNo).toBe(null);
    expect(normalizeCreateBatchPayload({ ...base, remark: '   ' }).remark).toBe(null);
    expect(normalizeCreateBatchPayload({ ...base, remark: '' }).remark).toBe(null);
    expect(normalizeCreateBatchPayload(base).batchNo).toBe(null);
    expect(normalizeCreateBatchPayload(base).remark).toBe(null);
  });

  it('其余字段与 stepOverrides 原样透传', () => {
    const stepOverrides = [
      { routeStepId: 's1', responsibleUserId: 'u1' },
      { routeStepId: 's2', actualSopFileId: 'f1' },
    ];
    expect(
      normalizeCreateBatchPayload({
        plannedQuantity: 12.5,
        routeId: 'r1',
        ownerId: 'o1',
        planStartDate: '2026-08-06',
        planEndDate: null,
        stepOverrides,
      }),
    ).toEqual({
      plannedQuantity: 12.5,
      batchNo: null,
      remark: null,
      routeId: 'r1',
      ownerId: 'o1',
      planStartDate: '2026-08-06',
      planEndDate: null,
      stepOverrides,
    });
  });

  it('归一化是幂等的：重复调用结果不变', () => {
    const once = normalizeCreateBatchPayload({ plannedQuantity: 1, batchNo: ' A ', remark: ' x ' });
    expect(normalizeCreateBatchPayload(once)).toEqual(once);
  });
});
