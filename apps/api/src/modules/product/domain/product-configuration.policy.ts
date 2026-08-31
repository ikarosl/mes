import type { ProductItemKind } from '@company/contracts';
import { ProductDomainError } from './product.errors.js';

export interface ConfigurableProduct {
  status: number;
  acquireMethod: 'self_made' | 'outsourced' | 'purchased';
  itemKind: ProductItemKind;
}

/** 可以拥有物料清单或工艺路线的产品记录。 */
export function requireConfigurableProduct(product: ConfigurableProduct): void {
  if (
    product.status !== 1 ||
    product.acquireMethod !== 'self_made' ||
    product.itemKind === 'material'
  ) {
    throw new ProductDomainError(
      'INVALID_PRODUCT_KIND',
      '只有已启用的自制半成品或成品可以配置工艺路线',
    );
  }
}
