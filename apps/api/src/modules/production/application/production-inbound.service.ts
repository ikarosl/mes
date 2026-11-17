import { Injectable } from '@nestjs/common';
import type { InventoryBatchQuery } from '@company/contracts';
import { ProductionInboundRepository } from './ports/production-inbound.repository.js';

@Injectable()
export class ProductionInboundService {
  constructor(private readonly repository: ProductionInboundRepository) {}
  listInventory(query: InventoryBatchQuery) {
    return this.repository.listInventory(query);
  }
  getInventory(id: string) {
    return this.repository.getInventory(id);
  }
}
