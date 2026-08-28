import type { AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../http', () => ({ httpClient: { request } }));

describe('productionApi', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ data: undefined });
  });

  it('lists one material active demand trace with server pagination', async () => {
    const { productionApi } = await import('../production');

    await productionApi.listInventoryMaterialDemandTrace('9', { page: 2, pageSize: 20 });

    expect(request).toHaveBeenCalledWith({
      url: '/production/inventory-material-supply-demand/9/demands',
      params: { page: 2, pageSize: 20 },
    });
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

  it('creates a work order with required fields', async () => {
    const { productionApi } = await import('../production');

    await productionApi.createOrder({
      workOrderNo: 'WO-2026-0001',
      productId: '1',
      plannedQuantity: 100,
      planStartDate: '2026-08-01',
      planEndDate: '2026-08-31',
    });

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders',
      method: 'POST',
      data: {
        workOrderNo: 'WO-2026-0001',
        productId: '1',
        plannedQuantity: 100,
        planStartDate: '2026-08-01',
        planEndDate: '2026-08-31',
      },
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

  it('releases an order via the semantic action endpoint', async () => {
    const { productionApi } = await import('../production');

    await productionApi.releaseOrder('1', 1);

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders/1/actions/release',
      method: 'POST',
      data: { version: 1 },
    });
  });

  it('cancels order via cancel action', async () => {
    const { productionApi } = await import('../production');

    await productionApi.cancelOrder('2', { version: 0, reason: '计划取消' });

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders/2/actions/cancel',
      method: 'POST',
      data: { version: 0, reason: '计划取消' },
    });
  });

  it('closes order via close action', async () => {
    const { productionApi } = await import('../production');

    await productionApi.closeOrder('3', { version: 2, reason: '计划终止' });

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders/3/actions/close',
      method: 'POST',
      data: { version: 2, reason: '计划终止' },
    });
  });

  it('completes an order only through the explicit completion endpoint', async () => {
    const { productionApi } = await import('../production');

    await productionApi.completeOrder('3', 2);

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders/3/actions/complete',
      method: 'POST',
      data: { version: 2 },
    });
  });

  it('loads the cancellation impact and cancels a production task with a reason', async () => {
    const { productionApi } = await import('../production');

    await productionApi.getBatchCancellationCheck('8');
    await productionApi.cancelBatch('8', { version: 4, reason: '计划调整' });

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/production/batches/8/cancellation-check',
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      url: '/production/batches/8/actions/cancel',
      method: 'POST',
      data: { version: 4, reason: '计划调整' },
    });
  });

  it('lists batches under a work order', async () => {
    const { productionApi } = await import('../production');

    await productionApi.listOrderBatches('1');

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders/1/batches',
    });
  });

  it('creates a batch under a work order with idempotency key and unsafe retry', async () => {
    const { productionApi } = await import('../production');

    await productionApi.createOrderBatch(
      '1',
      { batchNo: 'BATCH-001', plannedQuantity: 50 },
      'k1-uuid',
    );

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders/1/batches',
      method: 'POST',
      data: { batchNo: 'BATCH-001', plannedQuantity: 50 },
      headers: { 'Idempotency-Key': 'k1-uuid' },
      retryUnsafe: true,
      retryTimes: 2,
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

  it('lists execution batch summaries without per-row detail requests', async () => {
    const { productionApi } = await import('../production');
    await productionApi.listExecutionBatchSummaries({ page: 2, pageSize: 20, keyword: 'PB' });
    expect(request).toHaveBeenCalledWith({
      url: '/production/execution-batches',
      params: { page: 2, pageSize: 20, keyword: 'PB' },
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
    });

    expect(request).toHaveBeenCalledWith({
      url: '/production/batches/1/step-records/9/execution',
      method: 'PATCH',
      data: { version: 2, actualSopFileId: '7' },
    });
  });

  it('generates material demands with version', async () => {
    const { productionApi } = await import('../production');

    await productionApi.generateMaterialDemands('1', 0);

    expect(request).toHaveBeenCalledWith({
      url: '/production/batches/1/actions/generate-material-demands',
      method: 'POST',
      data: { version: 0 },
    });
  });

  it('creates material allocations with the supplied idempotency key', async () => {
    const { productionApi } = await import('../production');
    const data = { allocations: [{ demandId: '2', itemBatchId: '3', assignedQuantity: 1 }] };
    await productionApi.createMaterialAllocations('1', data, 'allocation-key');
    expect(request).toHaveBeenCalledWith({
      url: '/production/batches/1/material-allocations',
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': 'allocation-key' },
      retryUnsafe: true,
      retryTimes: 2,
    });
  });

  it('does not send an idempotency key when releasing an allocation', async () => {
    const { productionApi } = await import('../production');
    await productionApi.releaseMaterialAllocation('1', '9', 2);
    expect(request).toHaveBeenCalledWith({
      url: '/production/batches/1/material-allocations/9/actions/release',
      method: 'POST',
      data: { version: 2 },
    });
  });

  it('creates production material outbound with unsafe retry under the same key', async () => {
    const { productionApi } = await import('../production');
    const data = { details: [{ allocationId: '9', outboundQuantity: 2 }], remark: null };
    await productionApi.createMaterialOutbound('1', data, 'outbound-key');
    expect(request).toHaveBeenCalledWith({
      url: '/production/batches/1/material-outbounds',
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': 'outbound-key' },
      retryUnsafe: true,
      retryTimes: 2,
    });
  });

  it('uses real material outbound list, detail, candidate, confirm and cancel endpoints', async () => {
    const { productionApi } = await import('../production');
    await productionApi.listMaterialOutboundOrders({
      page: 1,
      pageSize: 20,
      status: 'pending_picking',
    });
    await productionApi.getMaterialOutbound('8');
    await productionApi.listMaterialOutboundBatchOptions();
    await productionApi.listMaterialOutboundCandidates('3');
    await productionApi.confirmMaterialOutbound('8', 0, 'confirm-key');
    await productionApi.cancelMaterialOutbound('9', { version: 1, reason: '计划调整' });
    expect(request.mock.calls.slice(-6).map(([config]) => config)).toEqual([
      {
        url: '/production/material-outbounds',
        params: { page: 1, pageSize: 20, status: 'pending_picking' },
      },
      { url: '/production/material-outbounds/8' },
      { url: '/production/material-outbounds/batch-options', skipErrorHandling: true },
      { url: '/production/batches/3/material-outbound-candidates' },
      {
        url: '/production/material-outbounds/8/actions/confirm',
        method: 'POST',
        data: { version: 0 },
        headers: { 'Idempotency-Key': 'confirm-key' },
        retryUnsafe: true,
        retryTimes: 2,
      },
      {
        url: '/production/material-outbounds/9/actions/cancel',
        method: 'POST',
        data: { version: 1, reason: '计划调整' },
      },
    ]);
  });

  it('uses Production-owned purchase inbound and inventory endpoints with correct idempotency', async () => {
    const { productionApi } = await import('../production');
    const data = {
      inboundNo: null,
      provider: '供应商 A',
      remark: null,
      details: [{ itemId: '2', batchCode: 'LOT-1', inboundQuantity: 5, remark: null }],
    };
    await productionApi.listPurchaseInbounds({ page: 1, pageSize: 20, status: 'pending' });
    await productionApi.getPurchaseInbound('7');
    await productionApi.createPurchaseInbound(data, 'create-inbound-key');
    await productionApi.confirmPurchaseInbound('7', 0, 'confirm-inbound-key');
    await productionApi.cancelPurchaseInbound('8', { version: 1, reason: '供应商变更' });
    await productionApi.listInventoryBatches({ page: 1, pageSize: 20 });
    await productionApi.getInventoryBatch('9');
    expect(request.mock.calls.slice(-7).map(([config]) => config)).toEqual([
      {
        url: '/production/purchase-inbounds',
        params: { page: 1, pageSize: 20, status: 'pending' },
      },
      { url: '/production/purchase-inbounds/7' },
      {
        url: '/production/purchase-inbounds',
        method: 'POST',
        data,
        headers: { 'Idempotency-Key': 'create-inbound-key' },
        retryUnsafe: true,
        retryTimes: 2,
      },
      {
        url: '/production/purchase-inbounds/7/actions/confirm',
        method: 'POST',
        data: { version: 0 },
        headers: { 'Idempotency-Key': 'confirm-inbound-key' },
        retryUnsafe: true,
        retryTimes: 2,
      },
      {
        url: '/production/purchase-inbounds/8/actions/cancel',
        method: 'POST',
        data: { version: 1, reason: '供应商变更' },
      },
      { url: '/production/inventory-batches', params: { page: 1, pageSize: 20 } },
      { url: '/production/inventory-batches/9' },
    ]);
  });

  it('uses semantic step assignment routes without idempotency headers', async () => {
    const { productionApi } = await import('../production');
    await productionApi.assignStep('1', '9', '7', 0);
    await productionApi.unassignStep('1', '9', 1);
    await productionApi.reassignStep('1', '9', '8', 2);
    expect(request.mock.calls.slice(-3).map(([config]) => config)).toEqual([
      {
        url: '/production/batches/1/step-records/9/actions/assign',
        method: 'POST',
        data: { responsibleUserId: '7', version: 0 },
      },
      {
        url: '/production/batches/1/step-records/9/actions/unassign',
        method: 'POST',
        data: { version: 1 },
      },
      {
        url: '/production/batches/1/step-records/9/actions/reassign',
        method: 'POST',
        data: { responsibleUserId: '8', version: 2 },
      },
    ]);
  });

  it('uses separate admin and employee SOP snapshot download routes', async () => {
    const { productionApi } = await import('../production');
    request.mockResolvedValue({ data: new Blob(['sop']) });

    await productionApi.batchStepSopContent('1', '9');
    await productionApi.workerTaskSopContent('1', '9');

    expect(request.mock.calls.slice(-2).map(([config]) => config)).toEqual([
      {
        url: '/production/batches/1/step-records/9/sop-content',
        responseType: 'blob',
        timeout: 0,
      },
      {
        url: '/production/worker-tasks/batches/1/step-records/9/sop-content',
        responseType: 'blob',
        timeout: 0,
      },
    ]);
  });

  it('lists current employee tasks and starts or completes a step with its version', async () => {
    const { productionApi } = await import('../production');
    await productionApi.listWorkerTasks();
    await productionApi.startStep('1', '9', 3);
    await productionApi.completeStep('1', '9', 4);
    expect(request.mock.calls.slice(-3).map(([config]) => config)).toEqual([
      { url: '/production/worker-tasks' },
      {
        url: '/production/batches/1/step-records/9/actions/start',
        method: 'POST',
        data: { version: 3 },
      },
      {
        url: '/production/batches/1/step-records/9/actions/complete',
        method: 'POST',
        data: { version: 4 },
      },
    ]);
  });

  it('checks and completes production execution without an idempotency header or client quantity', async () => {
    const { productionApi } = await import('../production');
    await productionApi.getExecutionCompletionCheck('1');
    await productionApi.completeProductionExecution('1', 4);
    expect(request.mock.calls.slice(-2).map(([config]) => config)).toEqual([
      { url: '/production/batches/1/execution-completion-check' },
      {
        url: '/production/batches/1/actions/complete-execution',
        method: 'POST',
        data: { version: 4 },
      },
    ]);
  });

  it('uses read-only Production trace endpoints without warehouse API ownership', async () => {
    const { productionApi } = await import('../production');
    await productionApi.searchProductionTrace({ keyword: 'IB-1', page: 1, pageSize: 20 });
    await productionApi.getProductionTrace('7');
    expect(request.mock.calls.slice(-2).map(([config]) => config)).toEqual([
      {
        url: '/production/trace',
        params: { keyword: 'IB-1', page: 1, pageSize: 20 },
      },
      { url: '/production/trace/batches/7' },
    ]);
  });

  it('uses idempotency only for report creation and correction, not reversal', async () => {
    const { productionApi } = await import('../production');
    const createBody = { version: 3, normalQuantity: 2, abnormalQuantity: 1, remark: null };
    await productionApi.createStepReport('1', '9', createBody, 'report-key');
    await productionApi.reverseStepReport('1', '9', '12', { version: 4, reason: '录入错误' });
    const correctBody = { version: 4, normalQuantity: 2, abnormalQuantity: 0, reason: '修正' };
    await productionApi.correctStepReport('1', '9', '12', correctBody, 'correct-key');
    expect(request.mock.calls.slice(-3).map(([config]) => config)).toEqual([
      {
        url: '/production/batches/1/step-records/9/reports',
        method: 'POST',
        data: createBody,
        headers: { 'Idempotency-Key': 'report-key' },
        retryUnsafe: true,
        retryTimes: 2,
      },
      {
        url: '/production/batches/1/step-records/9/reports/12/actions/reverse',
        method: 'POST',
        data: { version: 4, reason: '录入错误' },
      },
      {
        url: '/production/batches/1/step-records/9/reports/12/actions/correct',
        method: 'POST',
        data: correctBody,
        headers: { 'Idempotency-Key': 'correct-key' },
        retryUnsafe: true,
        retryTimes: 2,
      },
    ]);
  });

  it('loads supplement candidates and walks the draft save and confirm flow with idempotency', async () => {
    const { productionApi } = await import('../production');
    const saveBody = {
      planVersion: null,
      dispositionVersion: 0,
      materialEndStepRecordId: '3',
      details: [{ originalDemandId: '5', supplementQuantity: 1.25 }],
      remark: '补料',
    };
    await productionApi.listSupplementCandidates('8', '3');
    await productionApi.getScrapSupplementPlan('8');
    await productionApi.saveScrapSupplementPlan('8', saveBody);
    await productionApi.confirmScrapSupplementPlan(
      '8',
      { version: 0, dispositionVersion: 0 },
      'supplement-key',
    );
    expect(request.mock.calls.slice(-4).map(([config]) => config)).toEqual([
      {
        url: '/production/abnormal-dispositions/8/supplement-candidates',
        params: { materialEndStepRecordId: '3' },
      },
      { url: '/production/abnormal-dispositions/8/scrap-supplement-plan' },
      {
        url: '/production/abnormal-dispositions/8/scrap-supplement-plan',
        method: 'PUT',
        data: saveBody,
      },
      {
        url: '/production/abnormal-dispositions/8/scrap-supplement-plan/actions/confirm',
        method: 'POST',
        data: { version: 0, dispositionVersion: 0 },
        headers: { 'Idempotency-Key': 'supplement-key' },
        retryUnsafe: true,
        retryTimes: 2,
      },
    ]);
  });

  it('passes through a null scrap supplement plan for a disposition without a draft', async () => {
    const { productionApi } = await import('../production');
    request.mockResolvedValue({ data: null });

    const plan = await productionApi.getScrapSupplementPlan('8');

    expect(plan).toBeNull();
    expect(request).toHaveBeenCalledWith({
      url: '/production/abnormal-dispositions/8/scrap-supplement-plan',
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
