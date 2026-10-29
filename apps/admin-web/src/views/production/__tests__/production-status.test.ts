import { describe, expect, it } from 'vitest';
import {
  BATCH_STATUS_META,
  ORDER_STATUS_META,
  STEP_STATUS_META,
  batchStatusMeta,
  formatQuantity,
  orderStatusMeta,
  stepStatusMeta,
} from '../production-status';
import {
  BATCH_STEP_STATUSES,
  PRODUCTION_BATCH_STATUSES,
  WORK_ORDER_STATUSES,
} from '@company/constants';

describe('production-status', () => {
  it('工单状态元数据覆盖所有状态值域', () => {
    expect([...ORDER_STATUS_META.map((item) => item.value)].sort()).toEqual(
      [...WORK_ORDER_STATUSES].sort(),
    );
    for (const status of WORK_ORDER_STATUSES) {
      expect(orderStatusMeta(status).label).toBeTruthy();
    }
  });

  it('生产批次状态元数据覆盖所有状态值域', () => {
    expect([...BATCH_STATUS_META.map((item) => item.value)].sort()).toEqual(
      [...PRODUCTION_BATCH_STATUSES].sort(),
    );
    for (const status of PRODUCTION_BATCH_STATUSES) {
      expect(batchStatusMeta(status).label).toBeTruthy();
    }
  });

  it('工序执行状态元数据覆盖所有状态值域', () => {
    expect([...STEP_STATUS_META.map((item) => item.value)].sort()).toEqual(
      [...BATCH_STEP_STATUSES].sort(),
    );
    for (const status of BATCH_STEP_STATUSES) {
      expect(stepStatusMeta(status).label).toBeTruthy();
    }
  });

  it('formatQuantity 格式化数量并处理非法值', () => {
    expect(formatQuantity('1234.0000')).toBe('1,234');
    expect(formatQuantity(0)).toBe('0');
    expect(formatQuantity(null)).toBe('0');
    expect(formatQuantity(undefined)).toBe('0');
    expect(formatQuantity('abc')).toBe('-');
  });
});
