import type {
  ProcessRouteListItem,
  ProcessRoutePayload,
  ProcessRouteStatus,
  ProcessRouteStepItem,
  ProcessRouteStepPayload,
  ProcessStepListItem,
  ProcessStepPayload,
  ProductCategoryListItem,
  ProductCategoryPayload,
  ProductListItem,
  ProductMaterialItem,
  ProductMaterialPayload,
  ProductOption,
  ProductPayload,
  UserOption,
} from '@company/contracts';
import { toRequestError } from '@company/request';
import { httpClient } from './http';

const request = async <T>(config: Parameters<typeof httpClient.request<T>>[0]) => {
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
  categories: () => request<ProductCategoryListItem[]>({ url: `${base}/categories` }),
  createCategory: (data: ProductCategoryPayload) =>
    request<{ id: string }>({ url: `${base}/categories`, method: 'POST', data }),
  updateCategory: (id: string, data: ProductCategoryPayload) =>
    request<void>({ url: `${base}/categories/${id}`, method: 'PATCH', data }),
  setCategoryStatus: (id: string, status: number) =>
    request<void>({ url: `${base}/categories/${id}/status`, method: 'PATCH', data: { status } }),

  products: () => request<ProductListItem[]>({ url: `${base}/products` }),
  productOptions: () => request<ProductOption[]>({ url: `${base}/products/options` }),
  productFormOptions: () =>
    request<{
      categories: ProductCategoryListItem[];
      products: ProductOption[];
      routes: ProcessRouteListItem[];
    }>({ url: `${base}/products/form-options` }),
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

  processSteps: () => request<ProcessStepListItem[]>({ url: `${base}/process-steps` }),
  createProcessStep: (data: ProcessStepPayload) =>
    request<{ id: string }>({ url: `${base}/process-steps`, method: 'POST', data }),
  updateProcessStep: (id: string, data: ProcessStepPayload) =>
    request<void>({ url: `${base}/process-steps/${id}`, method: 'PATCH', data }),
  setProcessStepStatus: (id: string, status: number) =>
    request<void>({ url: `${base}/process-steps/${id}/status`, method: 'PATCH', data: { status } }),
  uploadProcessStepSop: (id: string, file: File) => {
    const data = new FormData();
    data.append('file', file);
    return request<void>({ url: `${base}/process-steps/${id}/sop`, method: 'POST', data });
  },

  routes: () => request<ProcessRouteListItem[]>({ url: `${base}/process-routes` }),
  routeFormOptions: () =>
    request<{
      products: ProductOption[];
      processSteps: ProcessStepListItem[];
      users: UserOption[];
    }>({ url: `${base}/process-routes/form-options` }),
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
  userOptions: () => request<UserOption[]>({ url: `${base}/users/options` }),
};
