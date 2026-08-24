import { describe, expect, it, vi } from 'vitest';
import { MysqlProductionInboundRepository } from '../mysql-production-inbound.repository.js';

describe('MysqlProductionInboundRepository inventory list', () => {
  it('only returns item_batch rows that already have inventory transactions', async () => {
    const inventoryRow = {
      id: 101,
      item_id: 5,
      item_code_snapshot: 'MAT-1',
      product_name_snapshot: '测试物料',
      unit_snapshot: 'kg',
      batch_code: 'B001',
      source_type: 'purchased',
      provider: null,
      batch_status: 'available',
      on_hand: '10.0000',
      reserved: '0.0000',
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{ id: 101 }], []])
      .mockResolvedValueOnce([[inventoryRow], []])
      .mockResolvedValueOnce([[], []]);
    const repository = new MysqlProductionInboundRepository({ query } as never);

    const result = await repository.listInventory({ page: 1, pageSize: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ itemBatchId: '101', batchCode: 'B001' });
    const existsClause =
      'EXISTS (SELECT 1 FROM inventory_transaction it WHERE it.batch_id = ib.id)';
    expect(String(query.mock.calls[0]?.[0])).toContain(existsClause);
    expect(String(query.mock.calls[1]?.[0])).toContain(existsClause);
  });
});
