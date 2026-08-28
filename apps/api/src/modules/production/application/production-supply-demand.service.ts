import { Injectable } from '@nestjs/common';
import type {
  InventoryMaterialDemandTraceQuery,
  InventoryMaterialSupplyDemandQuery,
} from '@company/contracts';
import { ProductionSupplyDemandRepository } from './ports/production-supply-demand.repository.js';

@Injectable()
export class ProductionSupplyDemandService {
  constructor(private readonly repository: ProductionSupplyDemandRepository) {}

  list(query: InventoryMaterialSupplyDemandQuery) {
    return this.repository.list(query);
  }

  listDemandTrace(itemId: string, query: InventoryMaterialDemandTraceQuery) {
    return this.repository.listDemandTrace(itemId, query);
  }
}
