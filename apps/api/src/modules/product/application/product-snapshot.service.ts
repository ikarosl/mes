import { Injectable } from '@nestjs/common';
import {
  ProductSnapshotQuery,
  type ProcessRouteSnapshot,
  type EnabledSopFileSnapshot,
  type ProductBomSnapshot,
  type ProductionProductSnapshot,
} from './product-snapshot.query.js';
import { ProductSnapshotRepository } from './ports/product-snapshot.repository.js';

@Injectable()
export class ProductSnapshotService extends ProductSnapshotQuery {
  constructor(private readonly snapshots: ProductSnapshotRepository) {
    super();
  }

  getProductionProduct(productId: string): Promise<ProductionProductSnapshot> {
    return this.snapshots.getProductionProduct(productId);
  }
  getBomSnapshot(productId: string): Promise<ProductBomSnapshot> {
    return this.snapshots.getBomSnapshot(productId);
  }
  getRouteSnapshot(routeId: string): Promise<ProcessRouteSnapshot> {
    return this.snapshots.getRouteSnapshot(routeId);
  }
  getEnabledSopFileSnapshot(fileId: string): Promise<EnabledSopFileSnapshot> {
    return this.snapshots.getEnabledSopFileSnapshot(fileId);
  }
}
