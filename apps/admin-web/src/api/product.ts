import type {
  ProcessRouteListItem,
  ProcessRouteOption,
  ProcessRouteQuery,
  ProcessRoutePayload,
  ProcessRouteStatus,
  ProcessRouteStepItem,
  ProcessRouteStepPayload,
  ProcessStepListItem,
  ProcessStepOption,
  ProcessStepPayload,
  ProcessStepQuery,
  ProductCategoryListItem,
  ProductCategoryOption,
  ProductCategoryPayload,
  ProductCategoryQuery,
  ProductListItem,
  ProductListQuery,
  ProductMaterialItem,
  ProductMaterialPayload,
  MaterialVariantItem,
  MaterialVariantListQuery,
  MaterialVariantPayload,
  ProductOption,
  PageResult,
  ProductPayload,
  TechnicalFileListItem,
  TechnicalFileQuery,
  UserOption,
} from '@company/contracts';
import { toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

const request = async <T>(config: RetryRequestConfig) => {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
};

const base = '/product';
const cleanProductPayload = (data: ProductPayload): ProductPayload => ({
  ...data,
  specValues: (data.specValues ?? [])
    .filter((item) => item.key.trim())
    .map((item) => ({
      key: item.key.trim(),
      value: item.value.trim(),
      unit: item.unit?.trim() || undefined,
    })),
});

export const productApi = {
  technicalFiles: (params: TechnicalFileQuery) =>
    request<PageResult<TechnicalFileListItem>>({ url: `${base}/technical-files`, params }),
  technicalFileContent: (id: string) =>
    request<Blob>({
      url: `${base}/technical-files/${id}/content`,
      responseType: 'blob',
      timeout: 0,
    }),
  categories: (params: ProductCategoryQuery) =>
    request<PageResult<ProductCategoryListItem>>({ url: `${base}/categories`, params }),
  // options 为表单参考读取（best-effort）：失败不触发全局 403 跳转/提示，由调用方 composable 降级
  categoryOptions: () =>
    request<ProductCategoryOption[]>({
      url: `${base}/categories/options`,
      skipErrorHandling: true,
    }),
  createCategory: (data: ProductCategoryPayload) =>
    request<{ id: string }>({ url: `${base}/categories`, method: 'POST', data }),
  updateCategory: (id: string, data: ProductCategoryPayload) =>
    request<void>({ url: `${base}/categories/${id}`, method: 'PATCH', data }),
  setCategoryStatus: (id: string, status: number) =>
    request<void>({ url: `${base}/categories/${id}/status`, method: 'PATCH', data: { status } }),

  products: (params: ProductListQuery) =>
    request<PageResult<ProductListItem>>({ url: `${base}/products`, params }),
  productOptions: () =>
    request<ProductOption[]>({ url: `${base}/products/options`, skipErrorHandling: true }),
  createProduct: (data: ProductPayload) =>
    request<{ id: string }>({
      url: `${base}/products`,
      method: 'POST',
      data: cleanProductPayload(data),
    }),
  updateProduct: (id: string, data: ProductPayload) =>
    request<void>({
      url: `${base}/products/${id}`,
      method: 'PATCH',
      data: cleanProductPayload(data),
    }),
  setProductStatus: (id: string, status: number) =>
    request<void>({ url: `${base}/products/${id}/status`, method: 'PATCH', data: { status } }),
  materialVariants: (params: MaterialVariantListQuery) =>
    request<PageResult<MaterialVariantItem>>({ url: `${base}/material-variants`, params }),
  materialVariantsByMaterial: (materialProductId: string) =>
    request<MaterialVariantItem[]>({
      url: `${base}/material-variants/by-material/${materialProductId}`,
      skipErrorHandling: true,
    }),
  createMaterialVariant: (data: MaterialVariantPayload) =>
    request<{ id: string; variantCode: string }>({
      url: `${base}/material-variants`,
      method: 'POST',
      data,
    }),
  setMaterialVariantStatus: (id: string, status: number) =>
    request<void>({
      url: `${base}/material-variants/${id}/status`,
      method: 'PATCH',
      data: { status },
    }),
  materials: (id: string) =>
    request<ProductMaterialItem[]>({ url: `${base}/products/${id}/materials` }),
  replaceMaterials: (id: string, items: ProductMaterialPayload[]) =>
    request<void>({ url: `${base}/products/${id}/materials`, method: 'PUT', data: { items } }),
  setDefaultRoute: (id: string, routeId: string | null) =>
    request<void>({
      url: `${base}/products/${id}/default-route`,
      method: 'PATCH',
      data: { routeId },
    }),

  processSteps: (params: ProcessStepQuery) =>
    request<PageResult<ProcessStepListItem>>({ url: `${base}/process-steps`, params }),
  processStepOptions: () =>
    request<ProcessStepOption[]>({ url: `${base}/process-steps/options`, skipErrorHandling: true }),
  createProcessStep: (data: ProcessStepPayload) =>
    request<{ id: string }>({ url: `${base}/process-steps`, method: 'POST', data }),
  updateProcessStep: (id: string, data: ProcessStepPayload) =>
    request<void>({ url: `${base}/process-steps/${id}`, method: 'PATCH', data }),
  setProcessStepStatus: (id: string, status: number) =>
    request<void>({ url: `${base}/process-steps/${id}/status`, method: 'PATCH', data: { status } }),
  // 上传接口带宽受限：不设客户端超时（由进度条与可取消代替），显式跳过自动重试与全局错误弹窗（取消不当作网络错误）。
  uploadProcessStepSop: (
    id: string,
    file: File,
    options: { signal?: AbortSignal; onUploadProgress?: (percentage: number) => void } = {},
  ) => {
    const data = new FormData();
    data.append('file', file);
    return request<void>({
      url: `${base}/process-steps/${id}/sop`,
      method: 'POST',
      data,
      timeout: 0,
      skipRetry: true,
      skipErrorHandling: true,
      signal: options.signal,
      onUploadProgress: (event) => {
        if (!options.onUploadProgress || !event.total) return;
        options.onUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      },
    });
  },

  routes: (params: ProcessRouteQuery) =>
    request<PageResult<ProcessRouteListItem>>({ url: `${base}/process-routes`, params }),
  routeOptions: () =>
    request<ProcessRouteOption[]>({
      url: `${base}/process-routes/options`,
      skipErrorHandling: true,
    }),
  createRoute: (data: ProcessRoutePayload) =>
    request<{ id: string }>({ url: `${base}/process-routes`, method: 'POST', data }),
  updateRoute: (id: string, data: ProcessRoutePayload) =>
    request<void>({ url: `${base}/process-routes/${id}`, method: 'PATCH', data }),
  setRouteStatus: (id: string, status: ProcessRouteStatus) =>
    request<void>({
      url: `${base}/process-routes/${id}/status`,
      method: 'PATCH',
      data: { status },
    }),
  deleteRoute: (id: string) =>
    request<void>({ url: `${base}/process-routes/${id}`, method: 'DELETE' }),
  routeSteps: (id: string) =>
    request<ProcessRouteStepItem[]>({ url: `${base}/process-routes/${id}/steps` }),
  replaceRouteSteps: (id: string, items: ProcessRouteStepPayload[]) =>
    request<void>({ url: `${base}/process-routes/${id}/steps`, method: 'PUT', data: { items } }),
  userOptions: () =>
    request<UserOption[]>({ url: `${base}/users/options`, skipErrorHandling: true }),
};
