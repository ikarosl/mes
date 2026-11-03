import type { BusinessTemplateDefaultItem } from '@company/contracts';
import { toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

export const incomingInspectionTemplateApi = {
  get: async (signal?: AbortSignal): Promise<BusinessTemplateDefaultItem> => {
    const config: RetryRequestConfig = {
      url: '/quality/incoming-inspection-template',
      signal,
      skipErrorHandling: true,
    };
    try {
      return (await httpClient.request<BusinessTemplateDefaultItem>(config)).data;
    } catch (error) {
      throw toRequestError(error);
    }
  },
};
