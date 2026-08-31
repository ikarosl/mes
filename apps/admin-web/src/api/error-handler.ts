import type { AxiosInstance } from 'axios';
import {
  CONCURRENCY_ERROR_CODES,
  IDEMPOTENCY_RESULT_CORRUPT,
  IDEMPOTENCY_STORAGE_RETRYABLE,
} from '@company/constants';
import { RequestError, toRequestError, type RetryRequestConfig } from '@company/request';
import { isHttpErrorHandled, markHttpErrorHandled } from './http-error-state';

export interface HttpErrorHandlerOptions {
  notify(message: string): void;
  onUnauthorized(): void;
  onForbidden(): void;
}

type ErrorHandlingRequestConfig = RetryRequestConfig;
const UNAUTHORIZED_NOTICE_WINDOW_MS = 3_000;

// 判断是否保留 API 返回的错误信息，若为 true，则不使用默认的错误提示，而是使用 API 返回的错误信息。
// 保护登录接口这种不需要登录的接口，避免在登录失败时覆盖 API 返回的 真实的错误提示信息。
const shouldPreserveApiMessage = (error: RequestError, config?: ErrorHandlingRequestConfig) =>
  (config ?? (error.response?.config as ErrorHandlingRequestConfig | undefined))
    ?.preserveErrorMessage === true;

/** 认证刷新优先执行；此处只处理最终仍然失败的请求。 */
export const installHttpErrorHandler = (
  client: AxiosInstance,
  options: HttpErrorHandlerOptions,
) => {
  let unauthorizedNoticeUntil = 0;
  client.interceptors.response.use(undefined, (error: unknown) => {
    const config = (error as { config?: ErrorHandlingRequestConfig }).config;
    const requestError = toRequestError(error);
    if (!config?.skipErrorHandling)
      handleHttpError(requestError, options, config, {
        shouldHandleUnauthorized: () => {
          const now = Date.now();
          if (now < unauthorizedNoticeUntil) return false;
          unauthorizedNoticeUntil = now + UNAUTHORIZED_NOTICE_WINDOW_MS;
          return true;
        },
      });
    return Promise.reject(requestError);
  });
};

export const handleHttpError = (
  error: unknown,
  options: HttpErrorHandlerOptions,
  config?: ErrorHandlingRequestConfig,
  state: { shouldHandleUnauthorized?: () => boolean } = {},
) => {
  if (isHttpErrorHandled(error)) return;
  markHttpErrorHandled(error);

  const requestError = toRequestError(error);
  if (!(requestError instanceof RequestError)) {
    options.notify('请求失败，请稍后重试');
    return;
  }
  if (requestError.status === 401 && !shouldPreserveApiMessage(requestError, config)) {
    if (state.shouldHandleUnauthorized && !state.shouldHandleUnauthorized()) return;
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
  options.notify(httpErrorMessage(requestError));
};

const httpErrorMessage = (error: RequestError): string => {
  const requestReference = error.requestId ? `（请求编号：${error.requestId}）` : '';
  if (error.code === CONCURRENCY_ERROR_CODES.idempotencyConflict)
    return `本次提交标识已用于不同内容，请刷新数据后重新操作${requestReference}`;
  if (error.code === IDEMPOTENCY_STORAGE_RETRYABLE)
    return `提交服务暂时不可用，请稍后重试${requestReference}`;
  if (error.code === IDEMPOTENCY_RESULT_CORRUPT)
    return `服务端保存的提交结果异常，请联系管理员核对业务结果${requestReference}`;
  if (error.code === 'INTERNAL_SERVER_ERROR' || error.status === 500)
    return `${error.message || '服务器内部错误，请稍后重试'}${requestReference}`;
  return error.message || '操作失败，请稍后重试';
};
