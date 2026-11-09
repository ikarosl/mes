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
    const { productionInventoryApi } = await import('../production/inventory');

    await productionInventoryApi.listInventoryMaterialDemandTrace('9', {
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
    const { productionWorkOrdersApi } = await import('../production/work-orders');
    request.mockResolvedValue({
      data: { items: [], total: 0, page: 1, pageSize: 10 },
    });

    await productionWorkOrdersApi.listOrders({ page: 1, pageSize: 10, status: 'draft' });

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders',
      params: { page: 1, pageSize: 10, status: 'draft' },
    });
  });

  it('lists work orders with keyword filter', async () => {
    const { productionWorkOrdersApi } = await import('../production/work-orders');

    await productionWorkOrdersApi.listOrders({ keyword: 'WO-001' });

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders',
      params: { keyword: 'WO-001' },
    });
  });

  it('gets work order detail', async () => {
    const { productionWorkOrdersApi } = await import('../production/work-orders');

    await productionWorkOrdersApi.getOrder('42');

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders/42',
    });
  });

  it('creates a work order with required fields', async () => {
    const { productionWorkOrdersApi } = await import('../production/work-orders');

    await productionWorkOrdersApi.createOrder(
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
    const { productionWorkOrdersApi } = await import('../production/work-orders');

    await productionWorkOrdersApi.createOrder(
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
    const { productionWorkOrdersApi } = await import('../production/work-orders');

    await productionWorkOrdersApi.updateOrder('1', {
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
    const { productionWorkOrdersApi } = await import('../production/work-orders');

    await productionWorkOrdersApi.updateOrder('1', {
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
    const { productionWorkOrdersApi } = await import('../production/work-orders');

    await productionWorkOrdersApi.releaseOrder('1', 1);

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders/1/actions/release',
      method: 'POST',
      data: { version: 1 },
    });
  });

  it('cancels order via cancel action', async () => {
    const { productionWorkOrdersApi } = await import('../production/work-orders');

    await productionWorkOrdersApi.cancelOrder('2', { version: 0, reason: '计划取消' });

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders/2/actions/cancel',
      method: 'POST',
      data: { version: 0, reason: '计划取消' },
    });
  });

  it('closes order via close action', async () => {
    const { productionWorkOrdersApi } = await import('../production/work-orders');

    await productionWorkOrdersApi.closeOrder('3', { version: 2, reason: '计划终止' });

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders/3/actions/close',
      method: 'POST',
      data: { version: 2, reason: '计划终止' },
    });
  });

  it('completes an order only through the explicit completion endpoint', async () => {
    const { productionWorkOrdersApi } = await import('../production/work-orders');

    await productionWorkOrdersApi.completeOrder('3', 2);

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders/3/actions/complete',
      method: 'POST',
      data: { version: 2 },
    });
  });

  it('loads the cancellation impact and cancels a production task with a reason', async () => {
    const { productionTasksApi } = await import('../production/tasks');

    await productionTasksApi.getBatchCancellationCheck('8');
    await productionTasksApi.cancelBatch('8', { version: 4, reason: '计划调整' });

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
    const { productionTasksApi } = await import('../production/tasks');

    await productionTasksApi.createOrderBatch(
      '1',
      { plannedQuantity: 50, ownerId: 'u1' },
      'k1-uuid',
    );

    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders/1/batches',
      method: 'POST',
      data: { plannedQuantity: 50, ownerId: 'u1' },
      headers: { 'Idempotency-Key': 'k1-uuid' },
    });
  });

  it('lists batches with combined query', async () => {
    const { productionTasksApi } = await import('../production/tasks');

    await productionTasksApi.listBatches({
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

  // TODO(production-tracking-query): 验证执行摘要分页且不逐行读取详情；高重要性，旧执行列表API已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按追踪卡工作台查询恢复。

  it('gets batch detail', async () => {
    const { productionTasksApi } = await import('../production/tasks');

    await productionTasksApi.getBatch('5');

    expect(request).toHaveBeenCalledWith({
      url: '/production/batches/5',
    });
  });

  it('updates a batch with version', async () => {
    const { productionTasksApi } = await import('../production/tasks');

    await productionTasksApi.updateBatch('1', {
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

  // TODO(production-tracking-sop): 验证冻结工序SOP来源与版本边界；高重要性，旧任务工序覆盖API已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按任务创建快照与历史SOP读取契约恢复。

  it('configures explicit material variants with an idempotency key', async () => {
    const { productionMaterialDemandsApi } = await import('../production/material-demands');
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

    await productionMaterialDemandsApi.configureMaterialDemands('1', data, 'configure-key');

    expect(request).toHaveBeenCalledWith({
      url: '/production/batches/1/material-demands/configurations',
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': 'configure-key' },
    });
  });

  it('adds manually selected variants under the production batch with an idempotency key', async () => {
    const { productionMaterialDemandsApi } = await import('../production/material-demands');
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
    await productionMaterialDemandsApi.addManualMaterialDemands('batch-1', data, 'manual-key');

    expect(request).toHaveBeenCalledWith({
      url: '/production/batches/batch-1/material-demands/additions',
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': 'manual-key' },
    });
  });

  it('creates material allocations with the supplied idempotency key', async () => {
    const { productionMaterialAllocationsApi } = await import('../production/material-allocations');
    const data = { allocations: [{ demandId: '2', itemBatchId: '3', assignedQuantity: 1 }] };
    await productionMaterialAllocationsApi.createMaterialAllocations('1', data, 'allocation-key');
    expect(request).toHaveBeenCalledWith({
      url: '/production/batches/1/material-allocations',
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': 'allocation-key' },
    });
  });

  it('does not send an idempotency key when releasing an allocation', async () => {
    const { productionMaterialAllocationsApi } = await import('../production/material-allocations');
    await productionMaterialAllocationsApi.releaseMaterialAllocation('1', '9', 2);
    expect(request).toHaveBeenCalledWith({
      url: '/production/batches/1/material-allocations/9/actions/release',
      method: 'POST',
      data: { version: 2 },
    });
  });

  it('creates production material outbound with the supplied idempotency key', async () => {
    const { productionMaterialOutboundsApi } = await import('../production/material-outbounds');
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
    await productionMaterialOutboundsApi.createMaterialOutbound('1', data, 'outbound-key');
    expect(request).toHaveBeenCalledWith({
      url: '/production/batches/1/material-outbounds',
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': 'outbound-key' },
    });
  });

  it('uses real material outbound list, detail, candidate, confirm and cancel endpoints', async () => {
    const { productionMaterialOutboundsApi } = await import('../production/material-outbounds');
    await productionMaterialOutboundsApi.listMaterialOutboundOrders({
      page: 1,
      pageSize: 20,
      status: 'pending_picking',
    });
    await productionMaterialOutboundsApi.getMaterialOutbound('8');
    await productionMaterialOutboundsApi.listMaterialOutboundBatchOptions();
    await productionMaterialOutboundsApi.listMaterialOutboundCandidates('3');
    await productionMaterialOutboundsApi.confirmMaterialOutbound('8', 0, 'confirm-key');
    await productionMaterialOutboundsApi.cancelMaterialOutbound('9', {
      version: 1,
      reason: '计划调整',
    });
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
    const { productionInboundsApi } = await import('../production/inbounds');
    const { productionInventoryApi } = await import('../production/inventory');
    await productionInboundsApi.listPurchaseInbounds({ page: 1, pageSize: 20, status: 'pending' });
    await productionInboundsApi.getPurchaseInbound('7');
    await productionInventoryApi.listInventoryBatches({ page: 1, pageSize: 20 });
    await productionInventoryApi.getInventoryBatch('9');
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

  // TODO(production-tracking-personnel): 验证现场人员登记与独立写权限；高重要性，旧工序派工API已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按追踪卡扫码人员契约恢复。

  // TODO(production-tracking-sop): 验证历史SOP下载来源及访问边界；高重要性，旧员工任务SOP API已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按追踪卡工序SOP下载契约恢复。

  // TODO(production-tracking-execution): 验证现场执行查询和版本保护；高重要性，旧员工任务及工序开工API已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按任务明确开始及逐卡扫码契约恢复。

  // TODO(production-tracking-finish): 验证任务结束的版本与幂等请求接线；高重要性，旧执行完成与结案版本API已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按任务人工结束契约恢复。

  // TODO(inventory-trace): 验证库存来源追溯的只读访问与归属边界；高重要性，旧生产追溯API已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按现行库存与追踪卡来源契约恢复。

  // TODO(production-tracking-facts): 验证数量事实与幂等请求接线且不重复计量；高重要性，旧人工报工及冲销API已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按扫码交接与一次性最终产出契约恢复。

  // TODO(production-tracking-abnormality): 验证异常处置的数量边界与幂等请求接线；高重要性，旧报废补料计划API已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按异常一次性结算与独立人工提需契约恢复。

  // TODO(production-tracking-abnormality): 验证异常未处理事实与已结算事实可区分；高重要性，旧报废补料草稿API已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按单次异常结算查询契约恢复。

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
    const { productionWorkOrdersApi } = await import('../production/work-orders');

    await expect(productionWorkOrdersApi.listOrders({})).rejects.toThrow(RequestError);
    await expect(productionWorkOrdersApi.listOrders({})).rejects.toMatchObject({
      status: 500,
      code: 'SERVER_ERROR',
    });
  });

  it('strips keyword whitespace for list orders', async () => {
    const { productionWorkOrdersApi } = await import('../production/work-orders');

    await productionWorkOrdersApi.listOrders({ keyword: '  WO-001  ' });

    // API 客户端原样传递参数；裁剪处理由控制器负责。
    expect(request).toHaveBeenCalledWith({
      url: '/production/work-orders',
      params: { keyword: '  WO-001  ' },
    });
  });
});
