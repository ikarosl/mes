import { describe, expect, it, vi } from 'vitest';
import { MysqlProductionSupplyDemandRepository } from '../mysql-production-supply-demand.repository.js';

describe('MysqlProductionSupplyDemandRepository', () => {
  it('matches demand snapshots but aggregates every active demand for the matched item', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([
        [
          {
            item_id: 5,
            material_variant_id: 6,
            item_code: 'MAT-NEW',
            item_name: '新名称',
            material_variant_code: 'V-6',
            unit: 'kg',
            total_inventory: '8',
            available_inventory: '6',
            open_demand: '10',
            shortage: '4',
          },
        ],
        [],
      ]);
    const repository = new MysqlProductionSupplyDemandRepository({ query } as never);

    const result = await repository.list({
      keyword: '旧名称',
      page: 1,
      pageSize: 10,
    });

    expect(result.items[0]).toMatchObject({
      itemId: '5',
      materialVariantId: '6',
      itemName: '新名称',
      openDemandQuantity: '10',
      shortageQuantity: '4',
      isShortage: true,
    });
    const dataSql = String(query.mock.calls[1]?.[0]);
    expect(dataSql).toContain('EXISTS (');
    expect(dataSql).toContain('SUM(remaining_number)');
    expect(dataSql).toContain('MAX(id) representative_demand_id');
    expect(dataSql).not.toContain('MAX(demand.item_name_snapshot)');
    expect(query.mock.calls[1]?.[1]).toEqual([
      '%旧名称%',
      '%旧名称%',
      '%旧名称%',
      '%旧名称%',
      '%旧名称%',
      '%旧名称%',
      10,
      0,
    ]);
  });

  it('traces each active demand to its work order, task and supplement source', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([
        [
          {
            id: 81,
            item_id: 5,
            material_variant_id: 6,
            material_variant_code: 'V-5',
            production_batch_id: 7,
            batch_no: 'TASK-007',
            work_order_id: 3,
            work_order_no: 'WO-003',
            demand_type: 'scrap_supplement',
            need_number: '6',
            remaining_number: '2',
            unit_snapshot: '件',
            parent_demand_id: 60,
            supplement_id: 12,
            supplement_no: 'SUP-012',
            abnormal_disposition_no: 'AD-009',
            material_loss_scrap_no: null,
            created_at: new Date('2026-08-27T01:00:00.000Z'),
          },
        ],
        [],
      ]);
    const repository = new MysqlProductionSupplyDemandRepository({ query } as never);

    const result = await repository.listDemandTrace('5', {
      materialVariantId: 'v5',
      page: 1,
      pageSize: 10,
    });

    expect(result.items[0]).toMatchObject({
      demandId: '81',
      materialVariantId: '6',
      materialVariantCode: 'V-5',
      batchNo: 'TASK-007',
      workOrderNo: 'WO-003',
      demandType: 'scrap_supplement',
      supplementNo: 'SUP-012',
      abnormalDispositionNo: 'AD-009',
      remainingDemandQuantity: '2',
    });
    const sql = String(query.mock.calls[1]?.[0]);
    expect(sql).toContain("demand.business_status='active'");
    expect(sql).toContain('JOIN production_batches');
    expect(sql).toContain('JOIN work_orders');
    expect(sql).toContain('LEFT JOIN production_material_supplement');
    expect(query.mock.calls[1]?.[1]).toEqual(['5', 'v5', 10, 0]);
  });
});
