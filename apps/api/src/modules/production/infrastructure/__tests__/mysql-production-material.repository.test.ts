import { describe, expect, it, vi } from 'vitest';
import { MysqlProductionMaterialRepository } from '../mysql-production-material.repository.js';

describe('MysqlProductionMaterialRepository available item batches', () => {
  it('filters out item batches with no positive available inventory', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ item_id: 5, material_variant_id: 6 }], []])
      .mockResolvedValueOnce([
        [
          {
            id: 101,
            item_id: 5,
            material_variant_id: 6,
            item_code_snapshot: 'MAT-1',
            item_name: '停用后的当前名称',
            material_variant_code_snapshot: 'V-6',
            batch_code: 'B001',
            unit_snapshot: 'kg',
            source_type: 'purchased',
            provider: null,
            production_date: null,
            on_hand: '10.0000',
            reserved: '0.0000',
          },
        ],
        [],
      ]);
    const repository = new MysqlProductionMaterialRepository({ query } as never);

    const result = await repository.listAvailableItemBatches('1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      itemBatchId: '101',
      materialVariantId: '6',
      itemName: '停用后的当前名称',
      batchCode: 'B001',
    });
    const sql = String(query.mock.calls[1]?.[0]);
    expect(sql).toContain("ib.batch_status='available'");
    expect(sql).toContain('ib.item_id=? AND ib.material_variant_id=?');
    expect(sql).toContain('display_material.material_name');
    expect(sql).toContain('HAVING on_hand > 0');
    expect(query.mock.calls[1]?.[1]).toEqual([5, 6]);
  });
});

describe('MysqlProductionMaterialRepository normal demand lookup', () => {
  it('uses a non-reserved alias for the EXISTS result', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ id: 7 }], []])
      .mockResolvedValueOnce([[{ has_normal_demands: 1 }], []]);
    const repository = new MysqlProductionMaterialRepository({ query } as never);

    await expect(repository.hasGeneratedNormalDemands('7')).resolves.toBe(true);

    const sql = String(query.mock.calls[1]?.[0]);
    expect(sql).toContain('AS has_normal_demands');
    expect(sql).not.toContain(') generated');
  });
});
