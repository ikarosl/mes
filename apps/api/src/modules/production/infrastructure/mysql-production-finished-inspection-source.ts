import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { withActiveConnection } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
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
  prepare(batchId: string, version: number): Promise<FinishedInspectionSource> {
    return this.active(async (db) => {
      const row = await lockOutputBatch(db, batchId);
      requireEditableOutput(row, version);
      const declared = draftOf(row);
      if (!declared)
        throw new QualityCommandError('INVALID_STATE', '产线须先保存产出草稿，再登记检验');
      return {
        closeoutId: String(row.id),
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
      if (updated.affectedRows !== 1)
        throw new QualityCommandError('CONCURRENT_MODIFICATION', '产出来源已变化，请刷新');
    });
  }
}
