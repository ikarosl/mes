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
        materialId: '2',
        quantityPerUnit: 1.25,
        unit: 'kg',
      },
    ];

    await productApi.replaceMaterials('1', items, 7);

    expect(request).toHaveBeenCalledWith({
      url: '/product/products/1/materials',
      method: 'PUT',
      data: { items, version: 7 },
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

  // TODO(product-api-json-table): 恢复产品与基础物料完整 JSON 表格的写入载荷映射覆盖。
  // 重要性：列定义、行顺序及单元格原文须完整传递至所属主数据接口。
  // 暂停原因：旧固定三列数组与 wrapper 清理、过滤逻辑已移除，旧创建请求也缺少必填规格书 ID。
  // 恢复条件：用户确认设计并明确授权正式测试后，按完整表格及规格书关联契约重建写入场景。

  it('passes route pagination filters as query parameters', async () => {
    request.mockResolvedValue({ data: { items: [], total: 0, page: 3, pageSize: 50 } });
    const { productApi } = await import('../product');

    await productApi.routes({ page: 1, pageSize: 10, status: 'draft' });

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/product/process-routes',
      params: { page: 1, pageSize: 10, status: 'draft' },
    });
  });

  it('maps material and material-version queries to their routes', async () => {
    request.mockResolvedValue({ data: { items: [], total: 0, page: 1, pageSize: 10 } });
    const { productApi } = await import('../product');

    await productApi.materialList({
      page: 3,
      pageSize: 50,
      keyword: '电阻',
      categoryId: 'c2',
      acquireMethod: 'purchased',
      status: 1,
    });
    await productApi.materialOptions();
    await productApi.materialVariantsByMaterial('m1');

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/product/materials',
      params: {
        page: 3,
        pageSize: 50,
        keyword: '电阻',
        categoryId: 'c2',
        acquireMethod: 'purchased',
        status: 1,
      },
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      url: '/product/materials/options',
      skipErrorHandling: true,
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      url: '/product/material-variants/by-material/m1',
      skipErrorHandling: true,
    });
  });

  // TODO(product-api-master-data-writes): 恢复成品、基础物料和精确版本的写入端点及载荷映射覆盖。
  // 重要性：成品规格书 CAS、版本必填文件及稳定业务路径为高重要性写入契约。
  // 暂停原因：原组合用例采用旧参数数组，且成品与版本载荷缺少必填规格书及关联核对字段。
  // 恢复条件：用户确认设计并明确授权正式测试后，按当前完整契约重建写入夹具，保留有效的读接口覆盖。

  it('reads product materials from the product-scoped route', async () => {
    const { productApi } = await import('../product');

    await productApi.productMaterials('p1');

    expect(request).toHaveBeenCalledWith({
      url: '/product/products/p1/materials',
    });
  });

  it('paginates categories and process steps and serves independent options endpoints', async () => {
    request.mockResolvedValue({ data: { items: [], total: 0, page: 1, pageSize: 10 } });
    const { productApi } = await import('../product');

    await productApi.categories({ page: 1, pageSize: 10, categoryCode: 'MAT', status: 1 });
    await productApi.processSteps({ page: 2, pageSize: 20, keyword: 'GX' });
    await productApi.categoryOptions();
    await productApi.processStepOptions();
    await productApi.routeOptions();

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/product/categories',
      params: { page: 1, pageSize: 10, categoryCode: 'MAT', status: 1 },
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      url: '/product/process-steps',
      params: { page: 2, pageSize: 20, keyword: 'GX' },
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      url: '/product/categories/options',
      skipErrorHandling: true,
    });
    expect(request).toHaveBeenNthCalledWith(4, {
      url: '/product/process-steps/options',
      skipErrorHandling: true,
    });
    expect(request).toHaveBeenNthCalledWith(5, {
      url: '/product/process-routes/options',
      skipErrorHandling: true,
    });
  });

  it('fetches technical file content as an authenticated blob', async () => {
    request.mockResolvedValue({ data: new Blob(['pdf'], { type: 'application/pdf' }) });
    const { productApi } = await import('../product');

    await expect(productApi.technicalFileContent('5')).resolves.toBeInstanceOf(Blob);
    expect(request).toHaveBeenCalledWith({
      url: '/product/technical-files/5/content',
      responseType: 'blob',
      timeout: 0,
    });
  });

  it('uploads a process step SOP without timeout or auto-retry and forwards cancel/progress', async () => {
    request.mockResolvedValue({ data: undefined });
    const { productApi } = await import('../product');
    const file = new File(['sop'], '焊接SOP.pdf', { type: 'application/pdf' });
    const controller = new AbortController();
    const onUploadProgress = vi.fn();

    await productApi.uploadProcessStepSop('9', file, {
      signal: controller.signal,
      onUploadProgress,
    });

    expect(request).toHaveBeenCalledTimes(1);
    const config = request.mock.calls[0][0];
    expect(config).toMatchObject({
      url: '/product/process-steps/9/sop',
      method: 'POST',
      timeout: 0,
      skipRetry: true,
      skipErrorHandling: true,
      signal: controller.signal,
    });
    expect(config.data).toBeInstanceOf(FormData);

    // 进度回调按百分比换算且封顶 100
    config.onUploadProgress({ loaded: 50, total: 200 });
    expect(onUploadProgress).toHaveBeenCalledWith(25);
    config.onUploadProgress({ loaded: 500, total: 200 });
    expect(onUploadProgress).toHaveBeenLastCalledWith(100);
    config.onUploadProgress({ loaded: 10 });
    expect(onUploadProgress).toHaveBeenCalledTimes(2);
  });
});
