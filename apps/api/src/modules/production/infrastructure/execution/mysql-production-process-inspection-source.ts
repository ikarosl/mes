import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { withActiveConnection } from '@company/database';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { DATABASE_POOL } from '../../../../infrastructure/database/database.module.js';
import {
  QualityCommandError,
  QualityProcessInspectionSourceRegistry,
} from '../../../quality/public.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { findBatch } from '../tasks/mysql-production-batch.persistence.js';
import { lockWorkOrderForBatch } from '../tasks/mysql-work-order-material-version.js';
import { requireUnfrozenStepActions } from './mysql-production-step-actions.persistence.js';

/** Quality 命令复用当前事务，先取得生产共同根，再锁专检单。 */
@Injectable()
export class MysqlProductionProcessInspectionSource implements OnModuleInit {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly registry: QualityProcessInspectionSourceRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async prepare(
    batchId: string,
    stepId: string,
    intent: 'create' | 'correct' | 'reverse',
  ): Promise<void> {
    try {
      await withActiveConnection(this.pool, async (db) => {
        if (!('release' in db))
          throw new QualityCommandError('INVALID_STATE', '工序专检必须位于业务事务中');
        await lockProcessInspectionStep(db as PoolConnection, batchId, stepId, intent);
      });
    } catch (error) {
      if (error instanceof ProductionDomainError)
        throw new QualityCommandError(
          error.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INVALID_STATE',
          error.message,
        );
      throw error;
    }
  }
}

export async function lockProcessInspectionStep(
  db: PoolConnection,
  batchId: string,
  stepId: string,
  intent: 'create' | 'correct' | 'reverse' = 'create',
): Promise<{ unit: string }> {
  await lockWorkOrderForBatch(db, batchId);
  const batch = await findBatch(db, batchId, true);
  if (intent === 'create') {
    await requireUnfrozenStepActions(db, batchId);
    if (batch.status !== 'doing')
      throw new ProductionDomainError('INVALID_STATE', '只有执行中的任务可以新增或处理工序专检');
  } else {
    await db.query(
      'SELECT id FROM production_batch_closeout WHERE production_batch_id=? FOR UPDATE',
      [batchId],
    );
    if (batch.started_at === null || batch.status === 'cancelled')
      throw new ProductionDomainError('INVALID_STATE', '未开工或已取消任务不能更正专检');
  }
  const [steps] = await db.query<
    (RowDataPacket & { id: number; status: string; unit_snapshot: string })[]
  >(
    `SELECT id,status,unit_snapshot FROM batch_step_records WHERE production_batch_id=?
     ORDER BY step_order_snapshot,id FOR UPDATE`,
    [batchId],
  );
  const step = steps.find((row) => String(row.id) === stepId);
  if (!step) throw new ProductionDomainError('NOT_FOUND', '任务工序不存在');
  if (intent === 'create' && step.status !== 'doing' && step.status !== 'completed')
    throw new ProductionDomainError('INVALID_STATE', '仅已开工或已完成工序可以新增或处理专检');
  return { unit: step.unit_snapshot };
}
