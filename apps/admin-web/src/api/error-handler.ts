import type { AxiosInstance } from 'axios';
import { RequestError, toRequestError, type RetryRequestConfig } from '@company/request';
import { isHttpErrorHandled, markHttpErrorHandled } from './http-error-state';

export interface HttpErrorHandlerOptions {
  notify(message: string): void;
  onUnauthorized(): void;
  onForbidden(): void;
}

type ErrorHandlingRequestConfig = RetryRequestConfig;

// 判断是否保留 API 返回的错误信息，若为 true，则不使用默认的错误提示，而是使用 API 返回的错误信息。
// 保护登录接口这种不需要登录的接口，避免在登录失败时覆盖 API 返回的 真实的错误提示信息。
const shouldPreserveApiMessage = (error: RequestError, config?: ErrorHandlingRequestConfig) =>
  (config ?? (error.response?.config as ErrorHandlingRequestConfig | undefined))
    ?.preserveErrorMessage === true;

/** Auth refresh runs first; this handles only the final failed request. */
export const installHttpErrorHandler = (
  client: AxiosInstance,
  options: HttpErrorHandlerOptions,
) => {
  client.interceptors.response.use(undefined, (error: unknown) => {
    const config = (error as { config?: ErrorHandlingRequestConfig }).config;
    const requestError = toRequestError(error);
    if (!config?.skipErrorHandling) handleHttpError(requestError, options, config);
    return Promise.reject(requestError);
  });
};

export const handleHttpError = (
  error: unknown,
  options: HttpErrorHandlerOptions,
  config?: ErrorHandlingRequestConfig,
) => {
  if (isHttpErrorHandled(error)) return;
  markHttpErrorHandled(error);

  const requestError = toRequestError(error);
  if (!(requestError instanceof RequestError)) {
    options.notify('请求失败，请稍后重试');
    return;
  }
  if (requestError.status === 401 && !shouldPreserveApiMessage(requestError, config)) {
    options.onUnauthorized();
    options.notify('登录状态已失效，请重新登录');
    return;
  }
  if (requestError.status === 403) {
    options.onForbidden();
    options.notify('当前账号没有执行此操作的权限');
    return;
  }
  if (requestError.status === 0) {
    options.notify('网络连接失败，请检查网络后重试');
    return;
  }
  if (requestError.code === 'ECONNABORTED') {
    options.notify('请求超时，请稍后重试');
    return;
  }
  options.notify(requestError.message || '操作失败，请稍后重试');
};
