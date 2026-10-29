import type { ProductItemKind } from '@company/contracts';
import { ProductDomainError } from './product.errors.js';

export interface ConfigurableProduct {
  status: number;
  acquireMethod: 'self_made' | 'outsourced' | 'purchased';
  itemKind: ProductItemKind;
}

/** 可以配置物料清单的成品记录。 */
export function requireConfigurableProduct(product: ConfigurableProduct): void {
  if (
    product.status !== 1 ||
    product.acquireMethod !== 'self_made' ||
    product.itemKind === 'material'
  ) {
    throw new ProductDomainError('INVALID_PRODUCT_KIND', '只有已启用的自制产品可以配置 BOM');
  }
}
