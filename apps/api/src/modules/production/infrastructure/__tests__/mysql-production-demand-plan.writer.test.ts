import { describe, expect, it, vi } from 'vitest';
import type { ResultSetHeader } from 'mysql2/promise';
import { MysqlProductionDemandPlanWriter } from '../mysql-production-demand-plan.writer.js';

const result = (overrides: { affectedRows?: number; insertId?: number } = {}): ResultSetHeader =>
  ({ affectedRows: 1, insertId: 0, ...overrides }) as ResultSetHeader;

describe('MysqlProductionDemandPlanWriter', () => {
  it('creates the whole demand group before advancing the batch material plan once', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([result({ insertId: 11 })])
      .mockResolvedValueOnce([result({ insertId: 12 })])
      .mockResolvedValueOnce([result()]);
    const writer = new MysqlProductionDemandPlanWriter();

    const ids = await writer.createDemandGroup({ execute } as never, {
      batchId: 7,
      actorId: '9',
      source: { type: 'normal', productionBatchId: 7 },
      expectedBatchVersion: 3,
      transitionToMaterialPending: true,
      lines: [demandLine(21, 'MAT-1'), demandLine(22, 'MAT-2')],
    });

    expect(ids).toEqual(['11', '12']);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(execute.mock.calls[0]?.[1]).toContain('NORMAL:7:21');
    expect(execute.mock.calls[1]?.[1]).toContain('NORMAL:7:22');
    expect(execute.mock.calls[2]?.[0]).toContain("status='material_pending'");
    expect(execute.mock.calls[2]?.[0]).toContain('material_plan_version=material_plan_version+1');
    expect(execute.mock.calls[2]?.[1]).toEqual(['9', 7, 3]);
  });

  it('rejects a stale batch version after cancelling remaining demands', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([result({ affectedRows: 2 })])
      .mockResolvedValueOnce([result()])
      .mockResolvedValueOnce([result({ affectedRows: 0 })]);
    const writer = new MysqlProductionDemandPlanWriter();

    await expect(
      writer.cancelRemainingDemands({ execute } as never, {
        batchId: 7,
        actorId: '9',
        reason: '短批结案',
        expectedBatchVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'CONCURRENT_MODIFICATION' });
  });
});

const demandLine = (productMaterialId: number, itemCode: string) => ({
  identityId: productMaterialId,
  productMaterialId,
  itemId: productMaterialId + 100,
  itemCode,
  itemName: itemCode,
  quantityPerUnit: '1.0000',
  unit: 'kg',
  isKeyMaterial: true,
  needBatchRecord: true,
  plannedOutputQuantity: '10.0000',
  needNumber: '10',
  demandType: 'normal' as const,
});
