import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import type {
  InventoryMaterialDemandTraceItem,
  InventoryMaterialDemandTraceQuery,
  InventoryMaterialSupplyDemandItem,
  InventoryMaterialSupplyDemandQuery,
  PageResult,
} from '@company/contracts';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionSupplyDemandRepository } from '../application/ports/production-supply-demand.repository.js';
import { MaterialVariantQuery } from '../../product/public.js';
import { ProductionSupplyDemandQueries } from './queries/production-supply-demand.query.js';

@Injectable()
export class MysqlProductionSupplyDemandRepository extends ProductionSupplyDemandRepository {
  private readonly queries: ProductionSupplyDemandQueries;

  constructor(@Inject(DATABASE_POOL) pool: Pool, variants: MaterialVariantQuery) {
    super();
    this.queries = new ProductionSupplyDemandQueries(pool, variants);
  }

  list(
    query: InventoryMaterialSupplyDemandQuery,
  ): Promise<PageResult<InventoryMaterialSupplyDemandItem>> {
    return this.queries.list(query);
  }

  listDemandTrace(
    itemId: string,
    query: InventoryMaterialDemandTraceQuery,
  ): Promise<PageResult<InventoryMaterialDemandTraceItem>> {
    return this.queries.listDemandTrace(itemId, query);
  }
}
