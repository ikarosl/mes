import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { withActiveConnection } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import type { StartFinishedInspectionResult } from '@company/contracts';
import { writeInventoryAudit } from './mysql-production-inventory.shared.js';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import {
  QualityFinishedInspectionSourceRegistry,
  QualityCommandError,
  type QualityFinishedInspectionSourceHandler,
  type FinishedInspectionSource,
} from '../../quality/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import {
  draftOf,
  lockOutputBatch,
  requireEditableOutput,
} from './mysql-production-output.persistence.js';
@Injectable()
export class MysqlProductionFinishedInspectionSource
  implements QualityFinishedInspectionSourceHandler, OnModuleInit
{
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly registry: QualityFinishedInspectionSourceRegistry,
  ) {}
  onModuleInit(): void {
    this.registry.register(this);
  }
  private async active<T>(run: (db: PoolConnection) => Promise<T>): Promise<T> {
    try {
      return await withActiveConnection(this.pool, async (db) => {
        if (!('release' in db))
          throw new QualityCommandError('INVALID_STATE', '成品检验必须位于来源事务中');
        return run(db as PoolConnection);
      });
    } catch (error) {
      if (error instanceof ProductionDomainError)
        throw new QualityCommandError(
          error.code === 'NOT_FOUND'
            ? 'NOT_FOUND'
            : error.code === 'CONCURRENT_MODIFICATION'
              ? 'CONCURRENT_MODIFICATION'
              : 'INVALID_STATE',
          error.message,
        );
      throw error;
    }
  }
  start(
    batchId: string,
    version: number,
    context: CommandContext,
  ): Promise<StartFinishedInspectionResult> {
    return this.active(async (db) => {
      const row = await lockOutputBatch(db, batchId);
      requireEditableOutput(row, version);
      if (!draftOf(row) || row.current_round_id === null)
        throw new QualityCommandError('INVALID_STATE', '请先保存本轮产出草稿');
      const [changed] = await db.execute<ResultSetHeader>(
        "UPDATE production_output_round SET status='inspecting',version=version+1,updated_by=? WHERE id=? AND closeout_id=? AND status='pending_inspection'",
        [context.actorId, row.current_round_id, row.id],
      );
      if (changed.affectedRows !== 1)
        throw new QualityCommandError('INVALID_STATE', '本轮已开始、已完成或已被替代');
      await db.execute(
        'UPDATE production_batch_closeout SET version=version+1,updated_by=? WHERE id=?',
        [context.actorId, row.id],
      );
      await writeInventoryAudit(
        db,
        context,
        'production-output.inspection.start',
        'production_batch',
        batchId,
        null,
        { closeoutId: String(row.id), roundId: String(row.current_round_id) },
      );
      return { batchId, roundId: String(row.current_round_id), version: row.version + 1 };
    });
  }
  prepare(batchId: string, version: number): Promise<FinishedInspectionSource> {
    return this.active(async (db) => {
      const row = await lockOutputBatch(db, batchId);
      requireEditableOutput(row, version);
      if (row.current_round_id === null)
        throw new QualityCommandError('INVALID_STATE', '请先保存本轮产出草稿');
      const [[round]] = await db.query<
        (import('mysql2/promise').RowDataPacket & { status: string })[]
      >('SELECT status FROM production_output_round WHERE id=? AND closeout_id=? FOR UPDATE', [
        row.current_round_id,
        row.id,
      ]);
      if (!round || round.status !== 'inspecting')
        throw new QualityCommandError('INVALID_STATE', '当前办理轮次不能登记检验，请刷新');
      const declared = draftOf(row);
      if (!declared)
        throw new QualityCommandError('INVALID_STATE', '产线须先保存产出草稿，再登记检验');
      return {
        closeoutId: String(row.id),
        roundId: String(row.current_round_id),
        batchId,
        version: row.version,
        declared: {
          availableQuantity: declared.availableQuantity,
          extraQuantity: declared.extraQuantity,
          additionalScrapQuantity: declared.additionalScrapQuantity,
        },
      };
    });
  }
  advance(source: FinishedInspectionSource, context: CommandContext): Promise<void> {
    return this.active(async (db) => {
      const [updated] = await db.execute<ResultSetHeader>(
        'UPDATE production_batch_closeout SET version=version+1,updated_by=? WHERE id=? AND production_batch_id=? AND version=?',
        [context.actorId, source.closeoutId, source.batchId, source.version],
      );
      await db.execute(
        "UPDATE production_output_round SET status='pending_finalization',version=version+1,updated_by=? WHERE id=? AND closeout_id=? AND status<>'superseded'",
        [context.actorId, source.roundId, source.closeoutId],
      );
      if (updated.affectedRows !== 1)
        throw new QualityCommandError('CONCURRENT_MODIFICATION', '产出来源已变化，请刷新');
    });
  }
}
