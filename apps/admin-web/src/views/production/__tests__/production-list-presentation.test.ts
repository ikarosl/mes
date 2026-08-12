import { describe, expect, it } from 'vitest';
import type { WorkOrderItem } from '@company/contracts';
import {
  batchMaterialStage,
  deadlinePresentation,
  quantityProgressPercentage,
  workOrderNextAction,
} from '../production-list-presentation';

const order = (overrides: Partial<WorkOrderItem> = {}): WorkOrderItem => ({
  id: 'order-1',
  workOrderNo: 'WO-001',
  productId: 'product-1',
  productCode: 'P-001',
  productName: '产品',
  unit: '件',
  plannedQuantity: '10.0000',
  customerName: null,
  qualityLevel: null,
  workOrderOwnerId: null,
  planStartDate: null,
  planEndDate: '2026-08-10',
  assignedQuantity: '4.0000',
  status: 'released',
  releasedAt: null,
  externalOrderNo: null,
  remark: null,
  version: 1,
  createdAt: '2026-08-01T00:00:00.000+08:00',
  updatedAt: '2026-08-01T00:00:00.000+08:00',
  ...overrides,
});

describe('production list presentation', () => {
  it('calculates quantity progress defensively', () => {
    expect(quantityProgressPercentage('4', '10')).toBe(40);
    expect(quantityProgressPercentage('12', '10')).toBe(100);
    expect(quantityProgressPercentage('1', '0')).toBe(0);
  });

  it('describes Beijing-calendar deadline risk without flagging terminal records', () => {
    const now = new Date('2026-08-12T00:00:00.000Z');
    expect(deadlinePresentation('2026-08-10', false, now)).toEqual({
      label: '已逾期 2 天',
      overdueDays: 2,
      tone: 'warning',
    });
    expect(deadlinePresentation('2026-08-12', false, now).label).toBe('今天到期');
    expect(deadlinePresentation('2026-08-14', false, now).label).toBe('剩余 2 天');
    expect(deadlinePresentation('2026-08-10T00:00:00.000Z', false, now).overdueDays).toBe(2);
    expect(deadlinePresentation('2026-08-10', true, now).label).toBe('已结束');
    expect(deadlinePresentation(null, false, now).label).toBe('未设置');
  });

  it('derives actionable work-order hints from existing facts', () => {
    expect(workOrderNextAction(order())).toBe('待创建生产批次');
    expect(workOrderNextAction(order({ assignedQuantity: '10.0000' }))).toBe('批次已分配');
    expect(workOrderNextAction(order({ status: 'doing' }))).toBe('跟进生产批次');
    expect(workOrderNextAction(order({ status: 'completed' }))).toBe('待关闭工单');
  });

  it('derives the material stage without creating another business status', () => {
    expect(batchMaterialStage('pending')).toEqual({ label: '待生成需求', type: 'info' });
    expect(batchMaterialStage('material_pending')).toEqual({ label: '待分配', type: 'warning' });
    expect(batchMaterialStage('material_assigned')).toEqual({ label: '已预留', type: 'primary' });
    expect(batchMaterialStage('doing')).toEqual({ label: '已领料', type: 'success' });
  });
});
