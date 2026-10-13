import { type RowDataPacket } from '../../../../apps/api/node_modules/mysql2/promise.js';
import { expect, it } from 'vitest';
import type { CommandContext } from '../../../../apps/api/src/common/audit/audit.types.js';
import { MysqlProductSnapshotRepository } from '../../../../apps/api/src/modules/product/infrastructure/mysql-product-snapshot.repository.js';
import {
  insert,
  cleanupMassMaterialVersionChoices,
  commandContext,
  type ProductionPersistenceContext,
} from './production-persistence-fixture.js';

export const registerProductionPersistenceTransactionCases = (
  getContext: () => ProductionPersistenceContext,
): void => {
  it('rolls back failed demand configuration and batch creation transactions', async () => {
    const { pool, repository, demandRepository, fixture } = getContext();

    const token = `${fixture.token}-rollback`;
    const workOrderId = await insert(
      pool,
      'INSERT INTO work_orders (work_order_no,order_type,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,planned_quantity,status) VALUES (?,?,?,?,?,?,?,?)',
      [
        `${token}-wo`,
        'mass_production',
        fixture.productId,
        `${fixture.token}-product`,
        'Production test product',
        'pcs',
        '4.0000',
        'released',
      ],
    );
    const configBatch = await repository.create(
      String(workOrderId),
      { batchNo: `${token}-config-batch`, plannedQuantity: 1 },
      null,
      [],
      commandContext(fixture.actorId, `${token}-config-batch-create`),
    );
    try {
      const oversizedRequestId = `${token}-${'x'.repeat(128)}`;
      await expect(
        demandRepository.configureNormalDemands(
          String(configBatch.id),
          [
            {
              productMaterialId: String(fixture.productMaterialId),
              splits: [{ materialVariantId: String(fixture.materialVariant1Id), quantity: 1 }],
            },
          ],
          {
            actorId: String(fixture.actorId),
            requestId: oversizedRequestId,
            ip: null,
            userAgent: null,
          },
        ),
      ).rejects.toBeDefined();
      const [[demandRollback]] = await pool.query<
        (RowDataPacket & {
          basis_count: number;
          demand_count: number;
          lock_count: number;
          audit_count: number;
          batch_status: string;
          batch_version: number;
        })[]
      >(
        `SELECT
           (SELECT COUNT(*) FROM production_material_requirement_basis WHERE production_batch_id=?) basis_count,
           (SELECT COUNT(*) FROM production_item_demand WHERE production_batch_id=?) demand_count,
           (SELECT COUNT(*) FROM work_order_material_versions WHERE work_order_id=? AND material_id=?) lock_count,
           (SELECT COUNT(*) FROM operation_logs WHERE request_id=? AND action='production-material-demand.configure-normal' AND result='success') audit_count,
           b.status batch_status,b.version batch_version
         FROM production_batches b WHERE b.id=?`,
        [
          configBatch.id,
          configBatch.id,
          workOrderId,
          fixture.materialId,
          oversizedRequestId,
          configBatch.id,
        ],
      );
      expect(demandRollback).toMatchObject({
        basis_count: 0,
        demand_count: 0,
        lock_count: 0,
        audit_count: 0,
        batch_status: 'pending',
        batch_version: 0,
      });

      const route = await new MysqlProductSnapshotRepository(pool).getRouteSnapshot(
        String(fixture.processRouteId),
      );
      const firstStep = route.steps[0];
      expect(firstStep).toBeDefined();
      const brokenRoute = { ...route, steps: [firstStep!, firstStep!] };
      const createFailureRequestId = `${token}-create-failure`;
      await expect(
        repository.create(
          String(workOrderId),
          { batchNo: `${token}-create-failure`, plannedQuantity: 1 },
          brokenRoute,
          [],
          commandContext(fixture.actorId, createFailureRequestId),
        ),
      ).rejects.toBeDefined();
      const [[createRollback]] = await pool.query<
        (RowDataPacket & { batch_count: number; audit_count: number })[]
      >(
        `SELECT
           (SELECT COUNT(*) FROM production_batches WHERE batch_no=?) batch_count,
           (SELECT COUNT(*) FROM operation_logs WHERE request_id=? AND action='production-batch.create' AND result='success') audit_count`,
        [`${token}-create-failure`, createFailureRequestId],
      );
      expect(createRollback).toEqual({ batch_count: 0, audit_count: 0 });
    } finally {
      await pool.execute('DELETE FROM production_item_demand WHERE production_batch_id=?', [
        configBatch.id,
      ]);
      await pool.execute(
        'DELETE FROM production_manual_demand_addition WHERE production_batch_id=?',
        [configBatch.id],
      );
      await pool.execute(
        'DELETE FROM production_material_requirement_basis WHERE production_batch_id=?',
        [configBatch.id],
      );
      await pool.execute('DELETE FROM production_batches WHERE id=?', [configBatch.id]);
      await cleanupMassMaterialVersionChoices(pool, workOrderId);
      await pool.execute('DELETE FROM work_orders WHERE id=?', [workOrderId]);
      await pool.execute('DELETE FROM http_idempotency_records WHERE idempotency_key LIKE ?', [
        `${token}%`,
      ]);
      await pool.execute('DELETE FROM operation_logs WHERE request_id LIKE ?', [`${token}%`]);
    }
  });

  it('serializes concurrent batch creation by locking the work order and duplicate batch number', async () => {
    const { pool, repository, fixture } = getContext();

    const payload = { batchNo: fixture.concurrentBatchNo, plannedQuantity: 1 };
    const commandContext: CommandContext = {
      actorId: String(fixture.actorId),
      ip: null,
      requestId: fixture.requestId,
      userAgent: null,
    };
    const results = await Promise.allSettled([
      repository.create(String(fixture.workOrderId), payload, null, [], commandContext),
      repository.create(String(fixture.workOrderId), payload, null, [], commandContext),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejection = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejection?.reason).toMatchObject({ code: 'CONFLICT' });
    const [[count]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM production_batches WHERE work_order_id=? AND batch_no=?',
      [fixture.workOrderId, fixture.concurrentBatchNo],
    );
    expect(Number(count.total)).toBe(1);
  });
};
