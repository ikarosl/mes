import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import type {
  PageResult,
  ProductionTraceBatchSummary,
  ProductionTraceDetail,
  ProductionTraceInventoryTransaction,
  ProductionTraceQuery,
  ProductionTraceWorkOrderGroup,
} from '@company/contracts';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionTraceRepository } from '../application/ports/production-trace.repository.js';
import { ProductionTraceQueries } from './queries/production-trace.query.js';

@Injectable()
export class MysqlProductionTraceRepository extends ProductionTraceRepository {
  private readonly queries: ProductionTraceQueries;

  constructor(@Inject(DATABASE_POOL) pool: Pool) {
    super();
    this.queries = new ProductionTraceQueries(pool);
  }

  search(query: ProductionTraceQuery): Promise<PageResult<ProductionTraceWorkOrderGroup>> {
    return this.queries.search(query);
  }

  getSummary(batchId: string): Promise<ProductionTraceBatchSummary> {
    return this.queries.getSummary(batchId);
  }

  listInventoryTransactions(batchId: string): Promise<ProductionTraceInventoryTransaction[]> {
    return this.queries.listInventoryTransactions(batchId);
  }

  listMaterialInboundSources(
    batchId: string,
  ): Promise<ProductionTraceDetail['materialInboundSources']> {
    return this.queries.listMaterialInboundSources(batchId);
  }
}
