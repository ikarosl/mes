import { toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from '../http';

export interface ReadRequestOptions {
  skipErrorHandling?: boolean;
  signal?: AbortSignal;
}

export async function request<T>(config: RetryRequestConfig): Promise<T> {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
}
