import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import type { InventoryBatchItem, InventoryBatchQuery, PageResult } from '@company/contracts';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { MaterialVariantQuery } from '../../product/public.js';
import { InventoryInboundRepository } from '../application/ports/inventory-inbound.repository.js';
import { getInventoryBatch, listInventoryBatches } from './queries/mysql-inventory-batch.query.js';

@Injectable()
export class MysqlInventoryInboundRepository extends InventoryInboundRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly variants: MaterialVariantQuery,
  ) {
    super();
  }
  listInventory(query: InventoryBatchQuery): Promise<PageResult<InventoryBatchItem>> {
    return listInventoryBatches(this.pool, query, this.variants);
  }
  getInventory(id: string) {
    return getInventoryBatch(this.pool, id, this.variants);
  }
}
