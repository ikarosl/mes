import { describe, expect, it, vi } from 'vitest';
import { MysqlProductionTraceRepository } from '../mysql-production-trace.repository.js';

describe('MysqlProductionTraceRepository material source projections', () => {
  // TODO(inventory-trace): 旧退料表来源断言已移除；正式测试阶段基于公共入库补回
  // 采购／退料／其他入库来源、当前名称、精确版本、单号与供应商归属覆盖。

  it('projects production outbound transactions with the exact material variant and current name', async () => {
    const query = vi.fn().mockResolvedValueOnce([
      [
        {
          transaction_id: 301,
          outbound_detail_id: 401,
          item_id: 5,
          material_variant_id: 6,
          item_code: 'MAT-1',
          item_name: '当前名称',
          material_variant_code: 'V-6',
          item_batch_id: 101,
          batch_code: 'B-001',
          quantity: '-4.0000',
          unit_snapshot: '件',
          created_at: new Date('2026-09-01T02:00:00.000Z'),
        },
      ],
      [],
    ]);
    const repository = new MysqlProductionTraceRepository({ query } as never);

    await expect(repository.listInventoryTransactions('21')).resolves.toEqual([
      expect.objectContaining({
        transactionId: '301',
        outboundDetailId: '401',
        materialVariantId: '6',
        itemName: '当前名称',
        quantity: '-4.0000',
      }),
    ]);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("tx.transaction_type='production_material_outbound'");
    expect(sql).toContain('display_material.material_name');
    expect(sql).toContain('tx.material_variant_id');
  });
});
