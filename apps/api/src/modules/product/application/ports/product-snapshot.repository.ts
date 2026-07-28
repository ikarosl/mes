import type {
  ProductBomSnapshot,
  ProcessRouteSnapshot,
  ProductionProductSnapshot,
} from '../product-snapshot.query.js';

export abstract class ProductSnapshotRepository {
  abstract getProductionProduct(productId: string): Promise<ProductionProductSnapshot>;
  abstract getBomSnapshot(productId: string): Promise<ProductBomSnapshot>;
  abstract getRouteSnapshot(routeId: string): Promise<ProcessRouteSnapshot>;
}
