import { loadWorkspaceEnv } from '../../../../packages/config/src/index.js';
import { type Pool, type RowDataPacket } from '../../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ProductionMaterialService } from '../../../../apps/api/src/modules/production/application/production-material.service.js';
import { type MysqlProductionMaterialRepository } from '../../../../apps/api/src/modules/production/infrastructure/mysql-production-material.repository.js';
import * as materialFixtures from './material-test-fixture.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Production material allocation and reservation MySQL transactions', () => {
  const { fixture, cleanup, ctx, idemCtx } = materialFixtures;
  let pool: Pool;
  let repository: MysqlProductionMaterialRepository;
  let service: ProductionMaterialService;
  let actorId: number;

  beforeAll(async () => {
    ({ pool, repository, service, actorId } = await materialFixtures.createMaterialTestContext(
      (createdPool) => {
        pool = createdPool;
      },
    ));
  });

  afterAll(async () => pool?.end());

  it('allocates, releases without deleting facts, and recomputes the batch material state', async () => {
    const f = await fixture(pool, actorId, 'release');
    try {
      const created = await repository.createAllocations(
        String(f.batchId),
        {
          allocations: [
            {
              demandId: String(f.demandId),
              itemBatchId: String(f.itemBatch1),
              assignedQuantity: 10,
            },
          ],
        },
        ctx(actorId, f.token),
      );
      expect(created.batchStatus).toBe('material_assigned');
      const released = await repository.releaseAllocation(
        String(f.batchId),
        created.allocations[0]!.allocationId,
        0,
        ctx(actorId, f.token),
      );
      expect(released.allocationStatus).toBe('released');
      const [[batch]] = await pool.query<(RowDataPacket & { status: string })[]>(
        'SELECT status FROM production_batches WHERE id=?',
        [f.batchId],
      );
      expect(batch?.status).toBe('material_pending');
    } finally {
      await cleanup(pool, f);
    }
  });

  it('serializes competing allocations on one inventory batch and prevents over-allocation', async () => {
    const a = await fixture(pool, actorId, 'race-a');
    const b = await fixture(pool, actorId, 'race-b', {
      sharedItemId: a.materialId,
      sharedCategoryId: a.materialCategoryId,
      sharedItemBatchId: a.itemBatch1,
      sharedMaterialVariant1Id: a.materialVariant1Id,
      sharedMaterialVariant2Id: a.materialVariant2Id,
    });
    try {
      const results = await Promise.allSettled([
        repository.createAllocations(
          String(a.batchId),
          {
            allocations: [
              {
                demandId: String(a.demandId),
                itemBatchId: String(a.itemBatch1),
                assignedQuantity: 8,
              },
            ],
          },
          ctx(actorId, a.token),
        ),
        repository.createAllocations(
          String(b.batchId),
          {
            allocations: [
              {
                demandId: String(b.demandId),
                itemBatchId: String(a.itemBatch1),
                assignedQuantity: 8,
              },
            ],
          },
          ctx(actorId, b.token),
        ),
      ]);
      expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
    } finally {
      await cleanup(pool, b);
      await cleanup(pool, a);
    }
  });

  it('replays allocation after a lost response, rejects key reuse with a different payload, and rolls back failed business writes', async () => {
    const f = await fixture(pool, actorId, 'allocation-idempotency');
    try {
      const key = `${f.token}-allocation-key`;
      const payload = {
        allocations: [
          { demandId: String(f.demandId), itemBatchId: String(f.itemBatch1), assignedQuantity: 4 },
        ],
      };
      const first = await service.createAllocations(
        String(f.batchId),
        payload,
        idemCtx(actorId, `${f.token}-first`, key),
      );
      const replay = await service.createAllocations(
        String(f.batchId),
        payload,
        idemCtx(actorId, `${f.token}-replay`, key),
      );
      expect(replay).toEqual(first);
      const [[factCount]] = await pool.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM production_item_allocation WHERE production_batch_id=?',
        [f.batchId],
      );
      expect(Number(factCount?.count)).toBe(1);
      await expect(
        service.createAllocations(
          String(f.batchId),
          { allocations: [{ ...payload.allocations[0]!, assignedQuantity: 5 }] },
          idemCtx(actorId, `${f.token}-conflict`, key),
        ),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });

      const failedKey = `${f.token}-failed-key`;
      await expect(
        service.createAllocations(
          String(f.batchId),
          {
            allocations: [
              {
                demandId: String(f.demandId),
                itemBatchId: String(f.itemBatch1),
                assignedQuantity: 99,
              },
            ],
          },
          idemCtx(actorId, `${f.token}-failed`, failedKey),
        ),
      ).rejects.toMatchObject({ code: 'ALLOCATION_EXCEEDS_DEMAND' });
      const [[failedRecordCount]] = await pool.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM http_idempotency_records WHERE idempotency_key=?',
        [failedKey],
      );
      expect(Number(failedRecordCount?.count)).toBe(0);
      const [[failedAuditCount]] = await pool.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) count FROM operation_logs WHERE request_id=? AND result='success'",
        [`${f.token}-failed`],
      );
      expect(Number(failedAuditCount?.count)).toBe(0);
    } finally {
      await cleanup(pool, f);
    }
  });
});
