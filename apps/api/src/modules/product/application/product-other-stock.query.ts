import type {
  OtherInventoryItemKind,
  OtherStockMaterialQuery,
  OtherStockMaterials,
  OtherStockObject,
  OtherStockObjectQuery,
  OtherStockObjects,
} from '@company/contracts';
import type { ProductQueryResult } from './product-snapshot.query.js';

export interface OtherStockIdentityReference {
  itemKind: OtherInventoryItemKind;
  materialVariantId?: string;
  productId?: string;
  requireEnabled: boolean;
}

/** 其他库存单的独立对象候选与同事务身份门禁，不授予生产或采购资格。 */
export abstract class ProductOtherStockQuery {
  /** 当前库存新批次可选基础物料，必须存在启用且未删除的精确版本。 */
  abstract listMaterials(query: OtherStockMaterialQuery): Promise<OtherStockMaterials>;

  abstract listObjects(query: OtherStockObjectQuery): Promise<OtherStockObjects>;

  /** 新批次要求启用身份；既有批次可读取停用或删除身份，结果保留输入顺序。 */
  abstract resolveReferences(input: {
    references: OtherStockIdentityReference[];
  }): Promise<ProductQueryResult<OtherStockObject[]>>;
}
