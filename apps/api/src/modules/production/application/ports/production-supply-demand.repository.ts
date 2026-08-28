import type {
  InventoryMaterialDemandTraceItem,
  InventoryMaterialDemandTraceQuery,
  InventoryMaterialSupplyDemandItem,
  InventoryMaterialSupplyDemandQuery,
  PageResult,
} from '@company/contracts';

export abstract class ProductionSupplyDemandRepository {
  abstract list(
    query: InventoryMaterialSupplyDemandQuery,
  ): Promise<PageResult<InventoryMaterialSupplyDemandItem>>;

  abstract listDemandTrace(
    itemId: string,
    query: InventoryMaterialDemandTraceQuery,
  ): Promise<PageResult<InventoryMaterialDemandTraceItem>>;
}
