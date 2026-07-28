import { describe, expect, it } from 'vitest';
import { ProductDomainError } from '../product.errors.js';
import { requireConfigurableProduct } from '../product-configuration.policy.js';

describe('requireConfigurableProduct', () => {
  it.each([
    { status: 0, acquireMethod: 'self_made' as const, itemKind: 'finished_product' as const },
    { status: 1, acquireMethod: 'purchased' as const, itemKind: 'finished_product' as const },
    { status: 1, acquireMethod: 'self_made' as const, itemKind: 'material' as const },
  ])('rejects a non-configurable product', (product) => {
    expect(() => requireConfigurableProduct(product)).toThrow(ProductDomainError);
  });

  it('accepts an enabled self-made finished product', () => {
    expect(() =>
      requireConfigurableProduct({
        status: 1,
        acquireMethod: 'self_made',
        itemKind: 'finished_product',
      }),
    ).not.toThrow();
  });
});
