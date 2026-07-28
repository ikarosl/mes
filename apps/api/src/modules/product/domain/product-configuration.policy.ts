import type { ProductItemKind } from '@company/contracts';
import { ProductDomainError } from './product.errors.js';

export interface ConfigurableProduct {
  status: number;
  acquireMethod: 'self_made' | 'outsourced' | 'purchased';
  itemKind: ProductItemKind;
}

/** Product records that may own a BOM or a process route. */
export function requireConfigurableProduct(product: ConfigurableProduct): void {
  if (
    product.status !== 1 ||
    product.acquireMethod !== 'self_made' ||
    product.itemKind === 'material'
  ) {
    throw new ProductDomainError(
      'INVALID_PRODUCT_KIND',
      'Only enabled self-made semi-finished products or finished products can be configured',
    );
  }
}
