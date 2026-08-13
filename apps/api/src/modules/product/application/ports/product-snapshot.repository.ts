import type {
  ProductBomSnapshot,
  ProcessRouteSnapshot,
  EnabledSopFileSnapshot,
  ProductionProductSnapshot,
  InventoryItemReference,
} from '../product-snapshot.query.js';

export abstract class ProductSnapshotRepository {
  abstract listInventoryItemReferencesByIds(itemIds: string[]): Promise<InventoryItemReference[]>;
  abstract listRouteStepMaterialIds(routeStepId: string): Promise<string[]>;
  abstract getProductionProduct(productId: string): Promise<ProductionProductSnapshot>;
  abstract getProductionRouteSnapshot(
    productId: string,
    requestedRouteId: string | null,
  ): Promise<ProcessRouteSnapshot | null>;
  abstract getBomSnapshot(productId: string): Promise<ProductBomSnapshot>;
  abstract getRouteSnapshot(routeId: string): Promise<ProcessRouteSnapshot>;
  abstract getEnabledSopFileSnapshot(fileId: string): Promise<EnabledSopFileSnapshot>;
}
