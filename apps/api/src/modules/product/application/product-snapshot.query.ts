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

export interface EnabledSopFileSnapshot {
  id: string;
  fileName: string;
  objectKey: string;
  versionNo: string;
}

/**
 * Product 模块的公开读边界失败结果。预期业务失败（目标不存在、数据不可用）不作为异常抛出，
 * 由调用方（如 Production）按 status 分支；意外的技术错误仍然抛出。
 */
export type ProductQueryFailure =
  { status: 'not-found'; message: string } | { status: 'invalid-input'; message: string };

/** 跨模块稳定查询结果：成功携带 value，失败携带协议无关的稳定状态。 */
export type ProductQueryResult<T> = { status: 'success'; value: T } | ProductQueryFailure;

/** 生产编排的公共读取边界。返回稳定的结果联合，绝不返回模块内部错误。 */
export abstract class ProductSnapshotQuery {
  abstract getProductionProduct(
    productId: string,
  ): Promise<ProductQueryResult<ProductionProductSnapshot>>;
  abstract getProductionRouteSnapshot(
    productId: string,
    requestedRouteId: string | null,
  ): Promise<ProductQueryResult<ProcessRouteSnapshot | null>>;
  abstract getBomSnapshot(productId: string): Promise<ProductQueryResult<ProductBomSnapshot>>;
  abstract getRouteSnapshot(routeId: string): Promise<ProductQueryResult<ProcessRouteSnapshot>>;
  abstract getEnabledSopFileSnapshot(
    fileId: string,
  ): Promise<ProductQueryResult<EnabledSopFileSnapshot>>;
}
