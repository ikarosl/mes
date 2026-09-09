import { describe, expect, it, vi } from 'vitest';
import { MysqlProductionTraceRepository } from '../mysql-production-trace.repository.js';

describe('MysqlProductionTraceRepository material source projections', () => {
  it('keeps current material names, source document numbers and real transaction types', async () => {
    const returnedAt = new Date('2026-09-01T02:00:00.000Z');
    const query = vi.fn().mockResolvedValueOnce([
      [
        {
          item_batch_id: 101,
          material_variant_id: 6,
          batch_code: 'B-PURCHASE',
          item_code: 'MAT-1',
          item_name: '停用后的当前名称',
          material_variant_code: 'V-6',
          source_document_no: 'PI-001',
          provider: '供应商 A',
          confirmed_at: new Date('2026-08-31T02:00:00.000Z'),
          quantity: '10.0000',
          transaction_id: 201,
          transaction_type: 'purchase_inbound',
        },
        {
          item_batch_id: 101,
          material_variant_id: 6,
          batch_code: 'B-RETURN',
          item_code: 'MAT-1',
          item_name: '停用后的当前名称',
          material_variant_code: 'V-6',
          source_document_no: 'TL-002',
          provider: null,
          confirmed_at: returnedAt,
          quantity: '2.0000',
          transaction_id: 202,
          transaction_type: 'material_return_inbound',
        },
        {
          item_batch_id: 102,
          material_variant_id: 7,
          batch_code: 'B-UNASSOCIATED',
          item_code: 'MAT-1',
          item_name: '停用后的当前名称',
          material_variant_code: 'V-7',
          source_document_no: null,
          provider: null,
          confirmed_at: new Date('2026-09-02T02:00:00.000Z'),
          quantity: '3.0000',
          transaction_id: 203,
          transaction_type: 'production_inbound',
        },
      ],
      [],
    ]);
    const repository = new MysqlProductionTraceRepository({ query } as never);

    await expect(repository.listMaterialInboundSources('21')).resolves.toEqual([
      expect.objectContaining({
        itemBatchId: '101',
        materialVariantId: '6',
        itemName: '停用后的当前名称',
        sourceLabel: 'purchase_inbound',
        sourceDocumentNo: 'PI-001',
        provider: '供应商 A',
        inventoryTransactionId: '201',
      }),
      expect.objectContaining({
        sourceLabel: 'material_return_inbound',
        sourceDocumentNo: 'TL-002',
        provider: null,
        confirmedAt: '2026-09-01T10:00:00.000+08:00',
      }),
      expect.objectContaining({
        itemBatchId: '102',
        materialVariantId: '7',
        sourceLabel: 'production_inbound',
        sourceDocumentNo: null,
        provider: null,
      }),
    ]);

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('display_material.material_name');
    expect(sql).toContain('tx.quantity>0');
    expect(sql).toContain("tx.reference_type='return_detail'");
    expect(query.mock.calls[0]?.[1]).toEqual(['21']);
  });

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
