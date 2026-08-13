import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { IDEMPOTENCY_RESULT_CORRUPT } from '@company/constants';

export interface RetryRequestConfig extends AxiosRequestConfig {
  retryTimes?: number;
  retryCount?: number;
  skipRetry?: boolean;
  retryUnsafe?: boolean;
  skipErrorHandling?: boolean;
  preserveErrorMessage?: boolean;
}

interface ApiErrorResponse {
  code?: string;
  message?: string;
  requestId?: string;
  details?: Record<string, unknown>;
}
type InternalRetryConfig = InternalAxiosRequestConfig & RetryRequestConfig;
const SAFE_RETRY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const canRetryRequest = (method: string | undefined, retryUnsafe = false) =>
  retryUnsafe || SAFE_RETRY_METHODS.has((method ?? 'GET').toUpperCase());

/**
 * 幂等结果损坏（500 IDEMPOTENCY_RESULT_CORRUPT）是确定性服务端数据错误：同键重试必然再次失败，
 * 且首次结果是否成功不可知，必须交由上层提示人工处理。请求层不得把它当普通 5xx 自动重试。
 */
const isCorruptResult = (error: AxiosError): boolean => {
  const data = error.response?.data as ApiErrorResponse | undefined;
  return typeof data?.code === 'string' && data.code === IDEMPOTENCY_RESULT_CORRUPT;
};
export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly response?: AxiosResponse,
    public readonly code?: string,
    public readonly requestId?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}
export const createRequestClient = (
  options: {
    baseURL?: string;
    timeoutMs?: number;
    onLoadingChange?: (loading: boolean) => void;
  } = {},
) => {
  let loadingCount = 0;
  const loading = (delta: number) => {
    loadingCount = Math.max(0, loadingCount + delta);
    options.onLoadingChange?.(loadingCount > 0);
  };
  const client = axios.create({ baseURL: options.baseURL, timeout: options.timeoutMs ?? 10_000 });
  client.interceptors.request.use((config) => {
    loading(1);
    return config;
  });
  client.interceptors.response.use(
    (response) => {
      loading(-1);
      return response;
    },
    async (error: AxiosError) => {
      loading(-1);
      const config = error.config as InternalRetryConfig | undefined;
      const attempts = config?.retryTimes ?? 1;
      if (
        config &&
        !config.skipRetry &&
        canRetryRequest(config.method, config.retryUnsafe) &&
        (config.retryCount ?? 0) < attempts &&
        (!error.response || error.response.status >= 500) &&
        !isCorruptResult(error)
      ) {
        config.retryCount = (config.retryCount ?? 0) + 1;
        await new Promise((resolve) => globalThis.setTimeout(resolve, 300 * config.retryCount!));
        return client.request(config);
      }
      return Promise.reject(error);
    },
  );
  return client;
};
export const toRequestError = (error: unknown) => {
  if (error instanceof RequestError) return error;
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiErrorResponse | undefined;
    const message = data && typeof data.message === 'string' ? data.message : error.message;
    return new RequestError(
      message || 'Request failed',
      error.response?.status ?? 0,
      error.response,
      typeof data?.code === 'string' ? data.code : error.code,
      typeof data?.requestId === 'string' ? data.requestId : undefined,
      data?.details,
    );
  }
  return error instanceof Error ? error : new Error('Request failed');
};
