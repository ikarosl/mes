import type {
  ProductBomSnapshot,
  ProcessRouteSnapshot,
  EnabledSopFileSnapshot,
  ProductionProductSnapshot,
} from '../product-snapshot.query.js';

export abstract class ProductSnapshotRepository {
  abstract getProductionProduct(productId: string): Promise<ProductionProductSnapshot>;
  abstract getBomSnapshot(productId: string): Promise<ProductBomSnapshot>;
  abstract getRouteSnapshot(routeId: string): Promise<ProcessRouteSnapshot>;
  abstract getEnabledSopFileSnapshot(fileId: string): Promise<EnabledSopFileSnapshot>;
}
