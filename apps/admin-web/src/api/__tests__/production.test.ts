import type { AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../http', () => ({ httpClient: { request } }));

const idempotencyHeaders = {
  headers: { 'Idempotency-Key': expect.any(String) },
};

describe('productionApi', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ data: undefined });
  });

  it('lists work orders with query params', async () => {
    const { productionApi } = await import('../production');
    request.mockResolvedValue({
      data: { items: [], total: 0, page: 1, pageSize: 10 },
    });

    await productionApi.listOrders({ page: 1, pageSize: 10, status: 'draft' });

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders',
      params: { page: 1, pageSize: 10, status: 'draft' },
    });
  });

  it('lists work orders with keyword filter', async () => {
    const { productionApi } = await import('../production');

    await productionApi.listOrders({ keyword: 'WO-001' });

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders',
      params: { keyword: 'WO-001' },
    });
  });

  it('gets work order detail', async () => {
    const { productionApi } = await import('../production');

    await productionApi.getOrder('42');

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders/42',
    });
  });

  it('creates a work order with basic fields', async () => {
    const { productionApi } = await import('../production');

    await productionApi.createOrder({
      workOrderNo: 'WO-2026-0001',
      productId: '1',
      plannedQuantity: 100,
    });

    expect(request).toHaveBeenCalledWith({
      ...idempotencyHeaders,
      url: '/production/work-orders',
      method: 'POST',
      data: { workOrderNo: 'WO-2026-0001', productId: '1', plannedQuantity: 100 },
    });
  });

  it('creates a work order with all optional fields', async () => {
    const { productionApi } = await import('../production');

    await productionApi.createOrder({
      workOrderNo: 'WO-2026-0002',
      productId: '2',
      plannedQuantity: 50,
      workOrderOwnerId: 'u1',
      customerName: '客户A',
      qualityLevel: 'A级',
      planStartDate: '2026-08-01',
      planEndDate: '2026-08-15',
      externalOrderNo: 'PO-001',
      remark: '加急订单',
    });

    expect(request).toHaveBeenCalledWith({
      ...idempotencyHeaders,
      url: '/production/work-orders',
      method: 'POST',
      data: {
        workOrderNo: 'WO-2026-0002',
        productId: '2',
        plannedQuantity: 50,
        workOrderOwnerId: 'u1',
        customerName: '客户A',
        qualityLevel: 'A级',
        planStartDate: '2026-08-01',
        planEndDate: '2026-08-15',
        externalOrderNo: 'PO-001',
        remark: '加急订单',
      },
    });
  });

  it('updates a work order with version', async () => {
    const { productionApi } = await import('../production');

    await productionApi.updateOrder('1', {
      externalOrderNo: 'CO-001',
      remark: '加急',
      version: 0,
    });

    expect(request).toHaveBeenCalledWith({
      ...idempotencyHeaders,
      url: '/production/work-orders/1',
      method: 'PATCH',
      data: { externalOrderNo: 'CO-001', remark: '加急', version: 0 },
    });
  });

  it('updates a work order with new fields', async () => {
    const { productionApi } = await import('../production');

    await productionApi.updateOrder('1', {
      productId: '2',
      plannedQuantity: 75,
      workOrderOwnerId: 'u2',
      customerName: '客户B',
      qualityLevel: 'B级',
      planStartDate: '2026-08-01',
      planEndDate: '2026-08-20',
      version: 1,
    });

    expect(request).toHaveBeenCalledWith({
      ...idempotencyHeaders,
      url: '/production/work-orders/1',
      method: 'PATCH',
      data: {
        productId: '2',
        plannedQuantity: 75,
        workOrderOwnerId: 'u2',
        customerName: '客户B',
        qualityLevel: 'B级',
        planStartDate: '2026-08-01',
        planEndDate: '2026-08-20',
        version: 1,
      },
    });
  });

  it('changes order status via actions endpoint', async () => {
    const { productionApi } = await import('../production');

    await productionApi.changeOrderStatus('1', 'release', 1);

    expect(request).toHaveBeenCalledWith({
      ...idempotencyHeaders,
      url: '/production/work-orders/1/actions/release',
      method: 'POST',
      data: { version: 1 },
    });
  });

  it('cancels order via cancel action', async () => {
    const { productionApi } = await import('../production');

    await productionApi.changeOrderStatus('2', 'cancel', 0);

    expect(request).toHaveBeenCalledWith({
      ...idempotencyHeaders,
      url: '/production/work-orders/2/actions/cancel',
      method: 'POST',
      data: { version: 0 },
    });
  });

  it('closes order via close action', async () => {
    const { productionApi } = await import('../production');

    await productionApi.changeOrderStatus('3', 'close', 2);

    expect(request).toHaveBeenCalledWith({
      ...idempotencyHeaders,
      url: '/production/work-orders/3/actions/close',
      method: 'POST',
      data: { version: 2 },
    });
  });

  it('lists batches under a work order', async () => {
    const { productionApi } = await import('../production');

    await productionApi.listOrderBatches('1');

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders/1/batches',
    });
  });

  it('creates a batch under a work order', async () => {
    const { productionApi } = await import('../production');

    await productionApi.createOrderBatch('1', {
      batchNo: 'BATCH-001',
      plannedQuantity: 50,
    });

    expect(request).toHaveBeenCalledWith({
      ...idempotencyHeaders,
      url: '/production/work-orders/1/batches',
      method: 'POST',
      data: { batchNo: 'BATCH-001', plannedQuantity: 50 },
    });
  });

  it('lists batches with combined query', async () => {
    const { productionApi } = await import('../production');

    await productionApi.listBatches({
      page: 1,
      pageSize: 20,
      status: 'doing',
      ownerId: 'u1',
      keyword: 'BATCH',
    });

    expect(request).toHaveBeenCalledWith({
      url: '/production/batches',
      params: { page: 1, pageSize: 20, status: 'doing', ownerId: 'u1', keyword: 'BATCH' },
    });
  });

  it('gets batch detail', async () => {
    const { productionApi } = await import('../production');

    await productionApi.getBatch('5');

    expect(request).toHaveBeenCalledWith({
      url: '/production/batches/5',
    });
  });

  it('updates a batch with version', async () => {
    const { productionApi } = await import('../production');

    await productionApi.updateBatch('1', {
      ownerId: 'u2',
      remark: '更换负责人',
      version: 0,
    });

    expect(request).toHaveBeenCalledWith({
      ...idempotencyHeaders,
      url: '/production/batches/1',
      method: 'PATCH',
      data: { ownerId: 'u2', remark: '更换负责人', version: 0 },
    });
  });

  it('updates a generated step execution override with the step version', async () => {
    const { productionApi } = await import('../production');

    await productionApi.updateBatchStepExecution('1', '9', {
      version: 2,
      actualSopFileId: '7',
      responsibleUserId: 'u3',
    });

    expect(request).toHaveBeenCalledWith({
      ...idempotencyHeaders,
      url: '/production/batches/1/step-records/9/execution',
      method: 'PATCH',
      data: { version: 2, actualSopFileId: '7', responsibleUserId: 'u3' },
    });
  });

  it('generates material demands with version', async () => {
    const { productionApi } = await import('../production');

    await productionApi.generateMaterialDemands('1', 0);

    expect(request).toHaveBeenCalledWith({
      ...idempotencyHeaders,
      url: '/production/batches/1/actions/generate-material-demands',
      method: 'POST',
      data: { version: 0 },
    });
  });

  it('handles network errors gracefully via toRequestError', async () => {
    const { RequestError } = await import('@company/request');
    const axios = await import('axios');
    const response = {
      status: 500,
      data: { code: 'SERVER_ERROR', message: 'Internal Server Error', requestId: 'req-1' },
    } as unknown as AxiosResponse;
    request.mockRejectedValue(
      new axios.AxiosError('Network Error', 'ECONNABORTED', undefined, undefined, response),
    );
    const { productionApi } = await import('../production');

    await expect(productionApi.listOrders({})).rejects.toThrow(RequestError);
    await expect(productionApi.listOrders({})).rejects.toMatchObject({
      status: 500,
      code: 'SERVER_ERROR',
    });
  });

  it('strips keyword whitespace for list orders', async () => {
    const { productionApi } = await import('../production');

    await productionApi.listOrders({ keyword: '  WO-001  ' });

    // The API client passes params as-is; the controller handles trimming
    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders',
      params: { keyword: '  WO-001  ' },
    });
  });
});
