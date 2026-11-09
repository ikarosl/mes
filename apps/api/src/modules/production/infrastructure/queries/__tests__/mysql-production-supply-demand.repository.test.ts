import { describe, expect, it, vi } from 'vitest';
import { MysqlProductionSupplyDemandRepository } from '../mysql-production-supply-demand.repository.js';

describe('MysqlProductionSupplyDemandRepository', () => {
  it('matches demand snapshots but aggregates every active demand for the matched item', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ material_id: 5 }], []])
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
    const repository = new MysqlProductionSupplyDemandRepository(
      { query } as never,
      { listEnabledByMaterials: vi.fn().mockResolvedValue([{ id: '6' }]) } as never,
    );

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
    const dataSql = String(query.mock.calls[2]?.[0]);
    expect(dataSql).toContain('EXISTS (');
    expect(dataSql).toContain('SUM(remaining_number)');
    expect(dataSql).toContain('MAX(id) representative_demand_id');
    expect(dataSql).not.toContain('MAX(demand.item_name_snapshot)');
    expect(query.mock.calls[2]?.[1]).toEqual([
      '6',
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

  // TODO(production-demand-trace): 验证活动需求的工单、任务与精确版本来源；高重要性，旧补产专属来源夹具已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按保留需求和公共库存来源恢复。
});
