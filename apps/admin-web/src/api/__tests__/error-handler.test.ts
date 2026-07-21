import { describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';
import { handleHttpError } from '../error-handler.js';

const createOptions = () => ({
  notify: vi.fn(),
  onUnauthorized: vi.fn(),
  onForbidden: vi.fn(),
});

describe('handleHttpError', () => {
  it('runs the unauthorized flow only once', () => {
    const options = createOptions();
    const error = new RequestError('令牌失效', 401);

    handleHttpError(error, options);
    handleHttpError(error, options);

    expect(options.onUnauthorized).toHaveBeenCalledTimes(1);
    expect(options.notify).toHaveBeenCalledWith('登录状态已失效，请重新登录');
  });

  it('maps network failures to a safe message', () => {
    const options = createOptions();

    handleHttpError(new RequestError('Network Error', 0), options);

    expect(options.notify).toHaveBeenCalledWith('网络连接失败，请检查网络后重试');
  });
});
