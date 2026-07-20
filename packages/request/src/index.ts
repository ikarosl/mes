import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

export interface RetryRequestConfig extends AxiosRequestConfig {
  retryTimes?: number;
  retryCount?: number;
  skipRetry?: boolean;
}
type InternalRetryConfig = InternalAxiosRequestConfig & RetryRequestConfig;
export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly response?: AxiosResponse,
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
        (config.retryCount ?? 0) < attempts &&
        (!error.response || error.response.status >= 500)
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
    const data = error.response?.data;
    const message =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : error.message;
    return new RequestError(
      message || 'Request failed',
      error.response?.status ?? 0,
      error.response,
    );
  }
  return error instanceof Error ? error : new Error('Request failed');
};
