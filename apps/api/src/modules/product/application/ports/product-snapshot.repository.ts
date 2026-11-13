import type {
  ProductBomSnapshot,
  ProcessRouteDisplayReference,
  EnabledSopFileSnapshot,
  ProductionProductSnapshot,
  InventoryItemDisplayReference,
  InventoryItemReference,
} from '../product-snapshot.query.js';

export abstract class ProductSnapshotRepository {
  abstract listProcessRouteDisplayReferencesByIds(
    routeIds: string[],
  ): Promise<ProcessRouteDisplayReference[]>;
  abstract listInventoryItemReferencesByIds(itemIds: string[]): Promise<InventoryItemReference[]>;
  abstract listInventoryItemDisplayReferencesByIds(
    itemIds: string[],
  ): Promise<InventoryItemDisplayReference[]>;
  abstract getProductionProduct(productId: string): Promise<ProductionProductSnapshot>;
  abstract getApprovedBomSnapshot(productId: string): Promise<ProductBomSnapshot>;
  abstract getEnabledSopFileSnapshot(fileId: string): Promise<EnabledSopFileSnapshot>;
}
