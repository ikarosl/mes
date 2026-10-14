import { describe, expect, it, vi } from 'vitest';
import { MysqlProductionMaterialLossRepository } from '../mysql-production-material-loss.repository.js';

const audit = { actorId: '7', requestId: 'req-loss-1', ip: null, userAgent: null };

describe('MysqlProductionMaterialLossRepository', () => {
  it('reads candidates with the current material name and filters consumed quantities', async () => {
    const query = vi.fn().mockResolvedValueOnce([
      [
        {
          allocation_id: 9,
          demand_id: 10,
          production_batch_id: 21,
          item_id: 5,
          material_variant_id: 6,
          batch_id: 101,
          item_code_snapshot: 'MAT-1',
          item_name: '停用后的当前名称',
          material_variant_code_snapshot: 'V-6',
          batch_code: 'B-101',
          unit_snapshot: '件',
          confirmed_quantity: '10.0000',
          occupied_quantity: '0.0000',
          occupied_return_quantity: '2.0000',
          occupied_loss_quantity: '1.0000',
        },
        {
          allocation_id: 10,
          demand_id: 11,
          production_batch_id: 21,
          item_id: 5,
          material_variant_id: 7,
          batch_id: 102,
          item_code_snapshot: 'MAT-1',
          item_name: '停用后的当前名称',
          material_variant_code_snapshot: 'V-7',
          batch_code: 'B-102',
          unit_snapshot: '件',
          confirmed_quantity: '1.0000',
          occupied_quantity: '0.0000',
          occupied_return_quantity: '1.0000',
          occupied_loss_quantity: '0.0000',
        },
      ],
      [],
    ]);
    const repository = new MysqlProductionMaterialLossRepository({ query } as never);

    await expect(repository.listMaterialLossCandidates('21')).resolves.toEqual([
      expect.objectContaining({
        allocationId: '9',
        materialVariantId: '6',
        itemName: '停用后的当前名称',
        confirmedOutboundQuantity: '10.0000',
        occupiedReturnQuantity: '2.0000',
        occupiedLossQuantity: '1.0000',
        availableLossQuantity: '7.0000',
      }),
    ]);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('display_material.material_name');
    expect(sql).toContain('allocation.material_variant_id');
    expect(query.mock.calls[0]?.[1]).toEqual(['21']);
  });

  it('creates a pending loss, writes transactional audit on the same connection, and reloads current names', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[candidateRow], []])
      .mockResolvedValueOnce([[materialLossRow], []]);
    connection.execute
      .mockResolvedValueOnce([{ insertId: 50, affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const pool = {
      getConnection: vi.fn().mockResolvedValue(connection),
    };
    const repository = new MysqlProductionMaterialLossRepository(pool as never);

    await expect(
      repository.createMaterialLoss(
        {
          productionBatchId: '21',
          allocationId: '9',
          scrapQuantity: 3,
          reasonType: 'process_loss',
          remark: '边角料',
        } as never,
        audit,
      ),
    ).resolves.toMatchObject({
      id: '50',
      itemName: '停用后的当前名称',
      materialVariantId: '6',
      status: 'pending',
    });

    expect(String(connection.execute.mock.calls[0]?.[0])).toContain('INSERT INTO item_scrap');
    expect(String(connection.execute.mock.calls[1]?.[0])).toContain('INSERT INTO operation_logs');
    expect(String(connection.query.mock.calls[2]?.[0])).toContain('display_material.material_name');
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('rolls back without writing a scrap or audit when the available loss quantity is exceeded', async () => {
    const connection = transactionConnection();
    connection.query.mockResolvedValueOnce([[], []]).mockResolvedValueOnce([[], []]);
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const repository = new MysqlProductionMaterialLossRepository(pool as never);

    await expect(
      repository.createMaterialLoss(
        {
          productionBatchId: '21',
          allocationId: '9',
          scrapQuantity: 1,
          reasonType: 'process_loss',
        } as never,
        audit,
      ),
    ).rejects.toMatchObject({ code: 'SCRAP_QUANTITY_EXCEEDED' });

    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('cancels a pending loss with an audit and optimistic version check', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[{ id: 50 }], []])
      .mockResolvedValueOnce([[materialLossRow], []])
      .mockResolvedValueOnce([
        [{ ...materialLossRow, status: 'cancelled', cancel_reason: '误报' }],
        [],
      ]);
    connection.execute
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const repository = new MysqlProductionMaterialLossRepository(pool as never);

    await expect(repository.cancelMaterialLoss('50', 0, '误报', audit)).resolves.toMatchObject({
      id: '50',
      status: 'cancelled',
      cancelReason: '误报',
    });
    expect(String(connection.execute.mock.calls[0]?.[0])).toContain("status='cancelled'");
    expect(String(connection.execute.mock.calls[1]?.[0])).toContain('INSERT INTO operation_logs');
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });
});

const transactionConnection = () => ({
  beginTransaction: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
});

const candidateRow = {
  allocation_id: 9,
  demand_id: 10,
  production_batch_id: 21,
  item_id: 5,
  material_variant_id: 6,
  batch_id: 101,
  item_code_snapshot: 'MAT-1',
  item_name: '停用后的当前名称',
  material_variant_code_snapshot: 'V-6',
  batch_code: 'B-101',
  unit_snapshot: '件',
  confirmed_quantity: '10.0000',
  occupied_quantity: '0.0000',
  occupied_return_quantity: '2.0000',
  occupied_loss_quantity: '1.0000',
};

const materialLossRow = {
  id: 50,
  scrap_no: 'SH-001',
  production_batch_id: 21,
  batch_no: 'PB-021',
  work_order_id: 3,
  work_order_no: 'WO-003',
  product_code: 'FG-1',
  product_name: '成品',
  allocation_id: 9,
  demand_id: 10,
  item_id: 5,
  material_variant_id: 6,
  batch_id: 101,
  item_code_snapshot: 'MAT-1',
  item_name: '停用后的当前名称',
  material_variant_code_snapshot: 'V-6',
  batch_code: 'B-101',
  scrap_number: '3.0000',
  unit_snapshot: '件',
  reason_type: 'process_loss',
  status: 'pending',
  confirmed_by: null,
  confirmed_at: null,
  created_by: 7,
  created_at: new Date('2026-09-01T02:00:00.000Z'),
  version: 0,
  remark: '边角料',
  cancel_reason: null,
  cancelled_by: null,
  cancelled_at: null,
  supplement_id: null,
  supplement_no: null,
  supplement_status: null,
  supplement_demand_id: null,
  supplement_demand_quantity: null,
};
