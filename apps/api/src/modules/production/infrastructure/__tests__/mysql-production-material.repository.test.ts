import { describe, expect, it, vi } from 'vitest';
import { MysqlProductionMaterialRepository } from '../mysql-production-material.repository.js';

describe('MysqlProductionMaterialRepository available item batches', () => {
  it('filters out item batches with no positive available inventory', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ item_id: 5 }], []])
      .mockResolvedValueOnce([
        [
          {
            id: 101,
            item_id: 5,
            item_code_snapshot: 'MAT-1',
            product_name_snapshot: '物料1',
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
    expect(result[0]).toMatchObject({ itemBatchId: '101', batchCode: 'B001' });
    const sql = String(query.mock.calls[1]?.[0]);
    expect(sql).toContain("ib.batch_status='available'");
    expect(sql).toContain('HAVING on_hand > 0');
  });
});
