import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';
import { handleHttpError, installHttpErrorHandler } from '../error-handler.js';
import { isHttpErrorHandled } from '../http-error-state.js';

const createOptions = () => ({
  notify: vi.fn(),
  onUnauthorized: vi.fn(),
  onForbidden: vi.fn(),
});

describe('handleHttpError', () => {
  it('runs the unauthorized flow only once', () => {
    const options = createOptions();
    const error = new RequestError('令牌失效', 401, {
      config: {},
    } as never);

    handleHttpError(error, options);
    handleHttpError(error, options);

    expect(isHttpErrorHandled(error)).toBe(true);
    expect(options.onUnauthorized).toHaveBeenCalledTimes(1);
    expect(options.notify).toHaveBeenCalledWith('登录状态已失效，请重新登录');
  });

  it('rejects the normalized error instance after notifying once', async () => {
    const options = createOptions();
    const client = axios.create({
      adapter: async (config) => {
        const response = {
          config,
          data: {
            code: 'CONFLICT',
            message: '编码或版本已存在',
            requestId: 'request_409',
          },
          headers: {},
          status: 409,
          statusText: 'Conflict',
        } as AxiosResponse;
        throw new AxiosError(
          'Request failed with status code 409',
          undefined,
          config as InternalAxiosRequestConfig,
          undefined,
          response,
        );
      },
    });
    installHttpErrorHandler(client, options);

    const error = await client.get('/product/categories').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(RequestError);
    expect(error).toMatchObject({
      code: 'CONFLICT',
      message: '编码或版本已存在',
      requestId: 'request_409',
      status: 409,
    });
    expect(isHttpErrorHandled(error)).toBe(true);
    expect(options.notify).toHaveBeenCalledOnce();
    expect(options.notify).toHaveBeenCalledWith('编码或版本已存在');
  });

  it('shows the API message for an anonymous login request that returns 401', () => {
    const options = createOptions();
    const error = new RequestError('用户名或密码错误', 401, {
      config: { preserveErrorMessage: true },
    } as never);

    handleHttpError(error, options);

    expect(options.onUnauthorized).not.toHaveBeenCalled();
    expect(options.notify).toHaveBeenCalledWith('用户名或密码错误');
  });

  it('maps network failures to a safe message', () => {
    const options = createOptions();

    handleHttpError(new RequestError('Network Error', 0), options);

    expect(options.notify).toHaveBeenCalledWith('网络连接失败，请检查网络后重试');
  });
});
