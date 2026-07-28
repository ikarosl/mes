export interface ProductionProductSnapshot {
  id: string;
  itemCode: string;
  productName: string;
  unit: string;
  defaultRouteId: string | null;
}

export interface ProductBomLineSnapshot {
  productMaterialId: string;
  materialProductId: string;
  itemCode: string;
  productName: string;
  unit: string;
  quantityPerUnit: string;
  isKeyMaterial: boolean;
  needBatchRecord: boolean;
}

export interface ProductBomSnapshot {
  product: ProductionProductSnapshot;
  lines: ProductBomLineSnapshot[];
}

export interface ProcessRouteStepSnapshot {
  routeStepId: string;
  stepOrder: number;
  processStepId: string;
  stepCode: string;
  stepName: string;
  description: string | null;
  defaultOwnerId: string | null;
  sop: { id: string; fileName: string; objectKey: string; versionNo: string } | null;
  needInspection: boolean;
  needRecord: boolean;
}

export interface ProcessRouteSnapshot {
  id: string;
  routeCode: string;
  routeName: string;
  versionNo: string;
  product: ProductionProductSnapshot;
  steps: ProcessRouteStepSnapshot[];
}

/** Public read boundary for future production orchestration. */
export abstract class ProductSnapshotQuery {
  abstract getProductionProduct(productId: string): Promise<ProductionProductSnapshot>;
  abstract getBomSnapshot(productId: string): Promise<ProductBomSnapshot>;
  abstract getRouteSnapshot(routeId: string): Promise<ProcessRouteSnapshot>;
}
