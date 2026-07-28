import { Injectable } from '@nestjs/common';
import { ProductSnapshotQuery } from './product-snapshot.query.js';
import { ProductSnapshotRepository } from './ports/product-snapshot.repository.js';

@Injectable()
export class ProductSnapshotService extends ProductSnapshotQuery {
  constructor(private readonly snapshots: ProductSnapshotRepository) {
    super();
  }

  getProductionProduct(productId: string) {
    return this.snapshots.getProductionProduct(productId);
  }
  getBomSnapshot(productId: string) {
    return this.snapshots.getBomSnapshot(productId);
  }
  getRouteSnapshot(routeId: string) {
    return this.snapshots.getRouteSnapshot(routeId);
  }
}
