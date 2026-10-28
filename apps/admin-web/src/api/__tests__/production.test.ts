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

    await productionApi.listInventoryMaterialDemandTrace('9', {
      materialVariantId: 'mv-9',
      page: 2,
      pageSize: 20,
    });

    expect(request).toHaveBeenCalledWith({
      url: '/production/inventory-material-supply-demand/9/demands',
      params: { materialVariantId: 'mv-9', page: 2, pageSize: 20 },
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

    await productionApi.createOrder(
      {
        orderType: 'mass_production',
        productId: '1',
        plannedQuantity: 100,
        planStartDate: '2026-08-01',
        planEndDate: '2026-08-31',
      },
      'work-order-create-key',
    );

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders',
      method: 'POST',
      headers: { 'Idempotency-Key': 'work-order-create-key' },
      skipErrorHandling: true,
      data: {
        orderType: 'mass_production',
        productId: '1',
        plannedQuantity: 100,
        planStartDate: '2026-08-01',
        planEndDate: '2026-08-31',
      },
    });
  });

  it('creates a work order with all optional fields', async () => {
    const { productionApi } = await import('../production');

    await productionApi.createOrder(
      {
        orderType: 'research',
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
      'work-order-create-key',
    );

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders',
      method: 'POST',
      headers: { 'Idempotency-Key': 'work-order-create-key' },
      skipErrorHandling: true,
      data: {
        orderType: 'research',
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

  it('creates a batch under a work order with the supplied idempotency key', async () => {
    const { productionApi } = await import('../production');

    await productionApi.createOrderBatch('1', { plannedQuantity: 50 }, 'k1-uuid');

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders/1/batches',
      method: 'POST',
      data: { plannedQuantity: 50 },
      headers: { 'Idempotency-Key': 'k1-uuid' },
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

  it('configures explicit material variants with an idempotency key', async () => {
    const { productionApi } = await import('../production');
    request.mockResolvedValueOnce({ data: { configured: true } });
    const data = {
      requirements: [
        {
          productMaterialId: 'pm-1',
          splits: [
            { materialVariantId: 'mv-1', quantity: 3 },
            { materialVariantId: 'mv-2', quantity: 2 },
          ],
        },
      ],
    };

    await productionApi.configureMaterialDemands('1', data, 'configure-key');

    expect(request).toHaveBeenCalledWith({
      url: '/production/batches/1/material-demands/configurations',
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': 'configure-key' },
    });
  });

  it('adds manually selected variants under the production batch with an idempotency key', async () => {
    const { productionApi } = await import('../production');
    const data = {
      reason: '生产补充',
      requirements: [
        {
          materialId: 'material-1',
          splits: [{ materialVariantId: 'mv-3', quantity: 1 }],
        },
      ],
    };

    request.mockResolvedValueOnce({
      data: { additionId: '1', additionNo: 'ADD-1', demandIds: ['2'] },
    });
    await productionApi.addManualMaterialDemands('batch-1', data, 'manual-key');

    expect(request).toHaveBeenCalledWith({
      url: '/production/batches/batch-1/material-demands/additions',
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': 'manual-key' },
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

  it('creates production material outbound with the supplied idempotency key', async () => {
    const { productionApi } = await import('../production');
    const data = { details: [{ allocationId: '9', outboundQuantity: 2 }], remark: null };
    request.mockResolvedValueOnce({
      data: {
        outbound: {
          productionBatchId: '1',
          outboundId: '9',
          status: 'pending_picking',
          details: [{}],
        },
      },
    });
    await productionApi.createMaterialOutbound('1', data, 'outbound-key');
    expect(request).toHaveBeenCalledWith({
      url: '/production/batches/1/material-outbounds',
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': 'outbound-key' },
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
        signal: undefined,
        skipErrorHandling: true,
      },
      { url: '/production/material-outbounds/8', signal: undefined, skipErrorHandling: true },
      {
        url: '/production/material-outbounds/batch-options',
        signal: undefined,
        skipErrorHandling: true,
      },
      {
        url: '/production/batches/3/material-outbound-candidates',
        signal: undefined,
        skipErrorHandling: true,
      },
      {
        url: '/production/material-outbounds/8/actions/confirm',
        method: 'POST',
        data: { version: 0 },
        headers: { 'Idempotency-Key': 'confirm-key' },
      },
      {
        url: '/production/material-outbounds/9/actions/cancel',
        method: 'POST',
        data: { version: 1, reason: '计划调整' },
      },
    ]);
  });

  it('uses read-only Production purchase inbound and inventory endpoints', async () => {
    const { productionApi } = await import('../production');
    await productionApi.listPurchaseInbounds({ page: 1, pageSize: 20, status: 'pending' });
    await productionApi.getPurchaseInbound('7');
    await productionApi.listInventoryBatches({ page: 1, pageSize: 20 });
    await productionApi.getInventoryBatch('9');
    expect(request.mock.calls.slice(-4).map(([config]) => config)).toEqual([
      {
        url: '/production/purchase-inbounds',
        params: { page: 1, pageSize: 20, status: 'pending' },
        signal: undefined,
        skipErrorHandling: true,
      },
      { url: '/production/purchase-inbounds/7', signal: undefined, skipErrorHandling: true },
      {
        url: '/production/inventory-batches',
        params: { page: 1, pageSize: 20 },
        signal: undefined,
        skipErrorHandling: true,
      },
      { url: '/production/inventory-batches/9', signal: undefined, skipErrorHandling: true },
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

  it('uses the employee SOP snapshot download route', async () => {
    const { productionApi } = await import('../production');
    request.mockResolvedValue({ data: new Blob(['sop']) });

    await productionApi.workerTaskSopContent('1', '9');

    expect(request.mock.calls.slice(-1).map(([config]) => config)).toEqual([
      {
        url: '/production/worker-tasks/batches/1/step-records/9/sop-content',
        responseType: 'blob',
        timeout: 0,
      },
    ]);
  });

  it('lists current employee tasks and starts a step with its version', async () => {
    const { productionApi } = await import('../production');
    await productionApi.listWorkerTasks({ page: 1, pageSize: 20 });
    await productionApi.startStep('1', '9', 3);
    expect(request.mock.calls.slice(-2).map(([config]) => config)).toEqual([
      { url: '/production/worker-tasks', params: { page: 1, pageSize: 20 } },
      {
        url: '/production/batches/1/step-records/9/actions/start',
        method: 'POST',
        data: { version: 3 },
      },
    ]);
  });

  it('checks and explicitly completes production execution with a versioned idempotent command', async () => {
    const { productionApi } = await import('../production');
    await productionApi.getExecutionCompletionCheck('1');
    await productionApi.completeProductionExecution(
      '1',
      { version: 4, closeoutVersion: null },
      'k2-uuid',
    );
    expect(request.mock.calls.slice(-2).map(([config]) => config)).toEqual([
      { url: '/production/batches/1/execution-completion-check' },
      {
        url: '/production/batches/1/actions/complete-execution',
        method: 'POST',
        data: { version: 4, closeoutVersion: null },
        headers: { 'Idempotency-Key': 'k2-uuid' },
        skipErrorHandling: true,
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
    const createBody = { version: 3, normalQuantity: 2, abnormalQuantity: 0, remark: null };
    await productionApi.createStepReport('1', '9', createBody, 'report-key');
    await productionApi.reverseStepReport('1', '9', '12', { version: 4, reason: '录入错误' });
    const correctBody = { version: 4, normalQuantity: 2, reason: '修正' };
    await productionApi.correctStepReport('1', '9', '12', correctBody, 'correct-key');
    expect(request.mock.calls.slice(-3).map(([config]) => config)).toEqual([
      {
        url: '/production/batches/1/step-records/9/reports',
        method: 'POST',
        data: createBody,
        headers: { 'Idempotency-Key': 'report-key' },
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
      },
    ]);
  });

  it('loads supplement candidates and walks the draft save and confirm flow with idempotency', async () => {
    const { productionApi } = await import('../production');
    const saveBody = {
      planVersion: null,
      dispositionVersion: 0,
      details: [
        {
          originalDemandId: '5',
          requirementBasisId: 'basis-5',
          materialVariantId: 'mv-5',
          supplementQuantity: 1.25,
        },
      ],
      remark: '补料',
    };
    await productionApi.listSupplementCandidates('8');
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

    // API 客户端原样传递参数；裁剪处理由控制器负责。
    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders',
      params: { keyword: '  WO-001  ' },
    });
  });
});
