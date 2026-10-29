import type {
  BusinessTemplateItem,
  BusinessTemplateListQuery,
  BusinessTemplatePayload,
  UpdateBusinessTemplatePayload,
  PageResult,
} from '@company/contracts';
import { toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

const request = async <T>(config: RetryRequestConfig): Promise<T> => {
  const localConfig: RetryRequestConfig = { ...config, skipErrorHandling: true };
  try {
    return (await httpClient.request<T>(localConfig)).data;
  } catch (error) {
    throw toRequestError(error);
  }
};
export const businessTemplatesApi = {
  list: (params: BusinessTemplateListQuery, signal?: AbortSignal) =>
    request<PageResult<BusinessTemplateItem>>({ url: '/templates', params, signal }),
  detail: (id: string, signal?: AbortSignal) =>
    request<BusinessTemplateItem>({ url: `/templates/${id}`, signal }),
  create: (data: BusinessTemplatePayload) =>
    request<BusinessTemplateItem>({ url: '/templates', method: 'POST', data, skipRetry: true }),
  update: (id: string, data: UpdateBusinessTemplatePayload) =>
    request<BusinessTemplateItem>({
      url: `/templates/${id}`,
      method: 'PATCH',
      data,
      skipRetry: true,
    }),
};
