import { beforeEach, describe, expect, it, vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../http', () => ({ httpClient: { request } }));

describe('productApi contract mapping', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ data: undefined });
  });

  it('replaces the canonical product BOM at the product route', async () => {
    const { productApi } = await import('../product');
    const items = [
      {
        materialProductId: '2',
        quantityPerUnit: 1.25,
        unit: 'kg',
        isKeyMaterial: true,
        needBatchRecord: true,
      },
    ];

    await productApi.replaceMaterials('1', items);

    expect(request).toHaveBeenCalledWith({
      url: '/product/products/1/materials',
      method: 'PUT',
      data: { items },
    });
  });

  it('uses dedicated endpoints for immutable route version steps and status', async () => {
    const { productApi } = await import('../product');
    const items = [{ processStepId: '8', stepOrder: 1, needInspection: true, needRecord: true }];

    await productApi.replaceRouteSteps('7', items);
    await productApi.setRouteStatus('7', 'enabled');

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/product/process-routes/7/steps',
      method: 'PUT',
      data: { items },
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      url: '/product/process-routes/7/status',
      method: 'PATCH',
      data: { status: 'enabled' },
    });
  });

  it('omits the blank specification row created by the product form', async () => {
    const { productApi } = await import('../product');

    await productApi.createProduct({
      itemCode: 'FG-1',
      productName: '成品',
      categoryId: '1',
      unit: 'pcs',
      acquireMethod: 'self_made',
      status: 1,
      specValues: [
        { key: ' 频率 ', value: ' 10 ', unit: ' GHz ' },
        { key: ' ', value: '', unit: '' },
      ],
    });

    expect(request).toHaveBeenCalledWith({
      url: '/product/products',
      method: 'POST',
      data: expect.objectContaining({ specValues: [{ key: '频率', value: '10', unit: 'GHz' }] }),
    });
  });
});
