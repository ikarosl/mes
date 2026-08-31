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
  /**
   * 仅供已由服务端幂等闭环保护的写请求显式开启自动重试。
   * 必须同时复用同一个 Idempotency-Key；普通写请求不得设置。
   */
  retryIdempotentWrite?: boolean;
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

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

const hasIdempotencyKey = (headers: unknown): boolean => {
  if (!headers || typeof headers !== 'object') return false;
  const getter = (headers as { get?: (name: string) => unknown }).get;
  if (typeof getter === 'function') return Boolean(getter.call(headers, IDEMPOTENCY_KEY_HEADER));
  return Boolean((headers as Record<string, unknown>)[IDEMPOTENCY_KEY_HEADER]);
};

export const canRetryRequest = (
  method: string | undefined,
  retryIdempotentWrite = false,
  hasKey = false,
) => {
  if (SAFE_RETRY_METHODS.has((method ?? 'GET').toUpperCase())) return true;
  // 写请求结果未知时（无响应/网关错误）自动重试只有复用同一 Idempotency-Key 才安全；
  // retryIdempotentWrite 必须绑定幂等键，否则一律视为不可自动重试的普通写请求。
  return retryIdempotentWrite && hasKey;
};

const canRetryResponse = (error: AxiosError, config: InternalRetryConfig): boolean => {
  // 没有收到响应时，服务端是否已处理未知；显式启用幂等重试的写请求必须复用原键重试。
  if (!error.response) return true;

  const status = error.response.status;
  if (SAFE_RETRY_METHODS.has((config.method ?? 'GET').toUpperCase())) return status >= 500;

  // 写请求的普通 500 通常是确定性代码/数据错误，立即重复只会制造噪声。仅重试常见的
  // 网关/临时不可用响应；调用方只有显式设置 retryIdempotentWrite 时才会到达此分支。
  return status === 502 || status === 503 || status === 504;
};

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
        canRetryRequest(
          config.method,
          config.retryIdempotentWrite,
          hasIdempotencyKey(config.headers),
        ) &&
        (config.retryCount ?? 0) < attempts &&
        canRetryResponse(error, config) &&
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
      message || '请求失败',
      error.response?.status ?? 0,
      error.response,
      typeof data?.code === 'string' ? data.code : error.code,
      typeof data?.requestId === 'string' ? data.requestId : undefined,
      data?.details,
    );
  }
  return error instanceof Error ? error : new Error('请求失败');
};
