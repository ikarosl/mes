import type {
  PageResult,
  PersonnelItem,
  PersonnelListQuery,
  PersonnelOption,
  SavePersonnelInput,
  UpdatePersonnelInput,
} from '@company/contracts';
import { toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';
interface ReadRequestOptions {
  skipErrorHandling?: boolean;
  signal?: AbortSignal;
}
async function request<T>(config: RetryRequestConfig): Promise<T> {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
}

export const personnelApi = {
  list: (
    params: PersonnelListQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<PersonnelItem>> =>
    request({ ...options, url: '/identity/personnel', params }),
  options: (options: ReadRequestOptions = {}): Promise<PersonnelOption[]> =>
    request({
      ...options,
      url: '/identity/personnel/options',
      skipErrorHandling: true,
    }),
  create: (data: SavePersonnelInput): Promise<PersonnelItem> =>
    request({ url: '/identity/personnel', method: 'POST', data }),
  update: (id: string, data: UpdatePersonnelInput): Promise<PersonnelItem> =>
    request({ url: `/identity/personnel/${id}`, method: 'PATCH', data }),
};
