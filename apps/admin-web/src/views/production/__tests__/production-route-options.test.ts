import { describe, expect, it } from 'vitest';
import { resolveDefaultRouteId } from '../production-route-options';

describe('resolveDefaultRouteId', () => {
  const routes = [
    { id: 'route-1', productId: 'product-1' },
    { id: 'route-2', productId: 'product-1' },
    { id: 'route-3', productId: 'product-2' },
  ];

  it('selects the configured product default instead of the first route', () => {
    expect(
      resolveDefaultRouteId('product-1', [{ id: 'product-1', defaultRouteId: 'route-2' }], routes),
    ).toBe('route-2');
  });

  it('falls back to the first product route when no usable default exists', () => {
    expect(
      resolveDefaultRouteId(
        'product-1',
        [{ id: 'product-1', defaultRouteId: 'missing-route' }],
        routes,
      ),
    ).toBe('route-1');
  });

  it('returns an empty value when the product has no route', () => {
    expect(resolveDefaultRouteId('product-3', [], routes)).toBe('');
  });
});
