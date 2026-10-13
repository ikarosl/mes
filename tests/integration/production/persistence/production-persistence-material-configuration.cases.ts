import { type RowDataPacket } from '../../../../apps/api/node_modules/mysql2/promise.js';
import { expect, it } from 'vitest';
import { idemCtx, type ProductionPersistenceContext } from './production-persistence-fixture.js';

export const registerProductionMaterialConfigurationCases = (
  getContext: () => ProductionPersistenceContext,
): void => {
  it('persists administrator-selected exact versions, supports a split and replays the same intent', async () => {
    const { pool, demandService, fixture } = getContext();

    const payload = {
      requirements: [
        {
          productMaterialId: String(fixture.productMaterialId),
          splits: [
            { materialVariantId: String(fixture.materialVariant1Id), quantity: 2 },
            { materialVariantId: String(fixture.materialVariant2Id), quantity: 1 },
          ],
        },
      ],
    };
    const first = await demandService.configure(
      String(fixture.batchId),
      payload,
      idemCtx(fixture.actorId, `${fixture.token}-configure`, `${fixture.token}-configure-key`),
    );
    const replay = await demandService.configure(
      String(fixture.batchId),
      payload,
      idemCtx(
        fixture.actorId,
        `${fixture.token}-configure-replay`,
        `${fixture.token}-configure-key`,
      ),
    );
    expect(first).toEqual({ configured: true });
    expect(replay).toEqual(first);

    const [demands] = await pool.query<
      (RowDataPacket & {
        requirement_basis_id: number;
        material_variant_id: number;
        material_variant_code_snapshot: string;
        need_number: string;
        demand_type: string;
      })[]
    >(
      `SELECT requirement_basis_id,material_variant_id,material_variant_code_snapshot,need_number,demand_type
       FROM production_item_demand WHERE production_batch_id=? ORDER BY material_variant_id`,
      [fixture.batchId],
    );
    expect(demands).toHaveLength(2);
    const demandByVariant = new Map(demands.map((row) => [row.material_variant_id, row]));
    expect(Number(demandByVariant.get(fixture.materialVariant1Id)?.need_number)).toBe(2);
    expect(Number(demandByVariant.get(fixture.materialVariant2Id)?.need_number)).toBe(1);
    expect(demands.every((row) => row.requirement_basis_id > 0)).toBe(true);
    expect(demands.every((row) => row.demand_type === 'normal')).toBe(true);
    expect(demandByVariant.get(fixture.materialVariant1Id)?.material_variant_code_snapshot).toBe(
      `${fixture.token}-material-v1-A`,
    );
    expect(demandByVariant.get(fixture.materialVariant2Id)?.material_variant_code_snapshot).toBe(
      `${fixture.token}-material-v2-A`,
    );
    const [[basis]] = await pool.query<
      (RowDataPacket & { required_number: string; material_id: number })[]
    >(
      'SELECT required_number,material_id FROM production_material_requirement_basis WHERE production_batch_id=?',
      [fixture.batchId],
    );
    expect(basis).toMatchObject({
      required_number: '3.0000',
      material_id: fixture.materialId,
    });
    const [[researchLock]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM work_order_material_versions WHERE work_order_id=? AND material_id=?',
      [fixture.workOrderId, fixture.materialId],
    );
    expect(Number(researchLock?.total ?? 0)).toBe(0);
    const [[batch]] = await pool.query<(RowDataPacket & { status: string; version: number })[]>(
      'SELECT status,version FROM production_batches WHERE id=?',
      [fixture.batchId],
    );
    expect(batch).toEqual({ status: 'material_pending', version: 1 });
    await expect(
      demandService.configure(
        String(fixture.batchId),
        payload,
        idemCtx(
          fixture.actorId,
          `${fixture.token}-configure-conflict`,
          `${fixture.token}-other-key`,
        ),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('serializes concurrent first version selection to one demand plan', async () => {
    const { pool, repository, demandService, fixture } = getContext();

    const batch = await repository.create(
      String(fixture.workOrderId),
      { batchNo: `${fixture.token}-version-race`, plannedQuantity: 1 },
      null,
      [],
      {
        actorId: String(fixture.actorId),
        ip: null,
        requestId: `${fixture.requestId}-version-race-create`,
        userAgent: null,
      },
    );
    const attempts = [
      {
        materialVariantId: String(fixture.materialVariant1Id),
        requestId: `${fixture.requestId}-version-race-v1`,
        idempotencyKey: `${fixture.token}-version-race-v1`,
      },
      {
        materialVariantId: String(fixture.materialVariant2Id),
        requestId: `${fixture.requestId}-version-race-v2`,
        idempotencyKey: `${fixture.token}-version-race-v2`,
      },
    ];
    const payloadFor = (materialVariantId: string) => ({
      requirements: [
        {
          productMaterialId: String(fixture.productMaterialId),
          splits: [{ materialVariantId, quantity: 1 }],
        },
      ],
    });

    try {
      const results = await Promise.allSettled(
        attempts.map((attempt) =>
          demandService.configure(
            String(batch.id),
            payloadFor(attempt.materialVariantId),
            idemCtx(fixture.actorId, attempt.requestId, attempt.idempotencyKey),
          ),
        ),
      );
      const winners = results.filter((result) => result.status === 'fulfilled');
      const losers = results.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect(losers[0]?.reason).toMatchObject({ code: 'INVALID_STATE' });

      const winnerIndex = results.findIndex((result) => result.status === 'fulfilled');
      const winner = attempts[winnerIndex];
      expect(winner).toBeDefined();
      const [demands] = await pool.query<
        (RowDataPacket & { material_variant_id: number; need_number: string })[]
      >(
        'SELECT material_variant_id,need_number FROM production_item_demand WHERE production_batch_id=?',
        [batch.id],
      );
      expect(demands).toHaveLength(1);
      expect(demands[0]).toMatchObject({
        material_variant_id: Number(winner!.materialVariantId),
        need_number: '1.0000',
      });
      const [[counts]] = await pool.query<
        (RowDataPacket & { basis_count: number; demand_count: number })[]
      >(
        `SELECT
           (SELECT COUNT(*) FROM production_material_requirement_basis WHERE production_batch_id=?) basis_count,
           (SELECT COUNT(*) FROM production_item_demand WHERE production_batch_id=?) demand_count`,
        [batch.id, batch.id],
      );
      expect(counts).toEqual({ basis_count: 1, demand_count: 1 });
    } finally {
      await pool.execute('DELETE FROM production_item_demand WHERE production_batch_id=?', [
        batch.id,
      ]);
      await pool.execute(
        'DELETE FROM production_material_requirement_basis WHERE production_batch_id=?',
        [batch.id],
      );
      await pool.execute('DELETE FROM production_batches WHERE id=?', [batch.id]);
      await pool.execute('DELETE FROM operation_logs WHERE request_id LIKE ?', [
        `${fixture.requestId}-version-race%`,
      ]);
    }
  });
};
