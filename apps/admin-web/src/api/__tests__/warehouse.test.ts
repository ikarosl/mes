import { describe, expect, it } from 'vitest';
import type {
  InboundDetailItem,
  InboundOrderItem,
  ItemScrapItem,
  StockCheckDetailItem,
  StockCheckItem,
} from '../warehouse';

/**
 * TODO(warehouse-api): 仓储模块后端尚未迁移。
 * 当前测试验证类型定义和模块结构的正确性。
 * 待后端实现后，按 production.test.ts 模式增加 mock HTTP 调用测试。
 */

describe('warehouseApi structure', () => {
  it('exports warehouseApi object', async () => {
    const { warehouseApi } = await import('../warehouse');
    expect(warehouseApi).toBeDefined();
  });
});

describe('warehouse type structural validation', () => {
  it('InboundOrderItem shape can be constructed at runtime', async () => {
    const item: InboundOrderItem = {
      id: '1',
      inboundNo: 'RK-001',
      sourceType: 'purchased',
      provider: '供应商A',
      status: 'pending',
      detailCount: 2,
      totalInboundNumber: '100.0000',
      inboundAt: null,
      remark: null,
      createdAt: '2026-07-29T00:00:00.000+08:00',
    };
    expect(item.inboundNo).toBe('RK-001');
    expect(item.sourceType).toBe('purchased');
    expect(item.detailCount).toBe(2);
  });

  it('StockCheckItem can represent a complete check order', async () => {
    const item: StockCheckItem = {
      id: 'sc1',
      checkNo: 'PD-001',
      status: 'completed',
      detailCount: 10,
      pendingItems: 2,
      startedAt: '2026-07-28T09:00:00.000+08:00',
      completedAt: '2026-07-29T10:00:00.000+08:00',
      remark: null,
      createdAt: '2026-07-27T08:00:00.000+08:00',
    };
    expect(item.checkNo).toBe('PD-001');
    expect(item.pendingItems).toBe(2);
  });

  it('ItemScrapItem supports all scrap scene types', async () => {
    const scenes = [
      'warehouse_allocated',
      'return_after_outbound',
      'production_consumed',
      'in_stock',
    ] as const;
    for (const scene of scenes) {
      const item: ItemScrapItem = {
        id: '1',
        scrapNo: 'BF-001',
        itemId: 'pi1',
        itemCode: 'MAT-001',
        itemName: '物料A',
        scrapScene: scene,
        scrapNumber: '10.0000',
        unit: 'pcs',
        reason: '质量不良',
        status: 'pending',
        remark: null,
        confirmedAt: null,
        createdAt: '2026-07-29T00:00:00.000+08:00',
      };
      expect(item.scrapScene).toBe(scene);
    }
  });

  it('StockCheckDetailItem tracks adjustment state', async () => {
    const detail: StockCheckDetailItem = {
      id: 'd1',
      stockCheckId: 'sc1',
      itemId: 'pi1',
      itemCode: 'MAT-001',
      itemName: '物料A',
      batchId: 'b1',
      batchCode: 'BATCH-001',
      stockStatus: 'available',
      systemQuantity: '100.0000',
      actualQuantity: '98.0000',
      differenceQuantity: '-2.0000',
      result: 'shortage',
      adjusted: false,
    };
    expect(detail.differenceQuantity).toBe('-2.0000');
    expect(detail.result).toBe('shortage');
    expect(detail.adjusted).toBe(false);
  });

  it('InboundDetailItem references batch and stock status', async () => {
    const detail: InboundDetailItem = {
      id: 'd1',
      inboundId: 'rk1',
      itemId: 'pi1',
      itemCode: 'MAT-001',
      itemName: '物料A',
      batchId: 'b1',
      batchCode: 'BATCH-001',
      inboundNumber: '50.0000',
      unit: 'pcs',
      stockStatus: 'available',
    };
    expect(detail.inboundNumber).toBe('50.0000');
    expect(detail.stockStatus).toBe('available');
  });
});
