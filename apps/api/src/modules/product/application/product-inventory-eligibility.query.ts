import type { ProductQueryResult } from './product-snapshot.query.js';

export interface MaterialIdentityReference {
  itemId: string;
  materialVariantId: string;
}

export interface InventoryMaterialEligibility extends MaterialIdentityReference {
  itemCode: string;
  materialVariantCode: string;
  unit: string;
  variantStatus: number;
}

/** 写命令的资格及父身份锁边界，必须在调用方事务内使用。 */
export abstract class ProductInventoryEligibility {
  abstract requirePurchasableReferences(input: {
    references: MaterialIdentityReference[];
  }): Promise<ProductQueryResult<InventoryMaterialEligibility[]>>;

  abstract requireProductionIssuableReferences(input: {
    references: MaterialIdentityReference[];
  }): Promise<ProductQueryResult<InventoryMaterialEligibility[]>>;

  /** 历史退回和盘点保留身份；停用或删除不使既有库存事实失效。 */
  abstract lockHistoricalReferences(input: {
    references: MaterialIdentityReference[];
    productIds?: string[];
  }): Promise<ProductQueryResult<void>>;
}
