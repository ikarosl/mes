import { describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { IDEMPOTENCY_RESULT_CORRUPT } from '@company/constants';
import {
  canRetryRequest,
  createRequestClient,
  toRequestError,
  type RetryRequestConfig,
} from '../index.js';

/** 构造固定失败的 adapter：每次都抛指定 status/code 的 AxiosError，并记录被调用次数 */
const failingAdapter = (status: number, code?: string) => {
  const calls: InternalAxiosRequestConfig[] = [];
  const adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    calls.push(config);
    const response = {
      status,
      data: code ? { code, message: 'server error' } : undefined,
      statusText: 'ERROR',
      headers: {},
      config,
    };
    const error = new AxiosError(
      `Request failed with status code ${status}`,
      AxiosError.ERR_BAD_RESPONSE,
      config,
      undefined,
      response,
    );
    throw error;
  };
  return { adapter, calls };
};

describe('request errors', () => {
  it('preserves regular Error instances', () => {
    const error = new Error('failed');
    expect(toRequestError(error)).toBe(error);
  });

  it('reads the standard API error envelope', () => {
    const error = {
      isAxiosError: true,
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: { code: 'BAD_REQUEST', message: '参数错误', requestId: 'request_1234' },
      },
    };

    expect(toRequestError(error)).toMatchObject({
      name: 'RequestError',
      status: 400,
      code: 'BAD_REQUEST',
      requestId: 'request_1234',
      message: '参数错误',
    });
  });

  it('retries only safe methods unless an unsafe retry is explicitly enabled', () => {
    expect(canRetryRequest('GET')).toBe(true);
    expect(canRetryRequest('post')).toBe(false);
    expect(canRetryRequest('PATCH')).toBe(false);
    expect(canRetryRequest('POST', true)).toBe(true);
  });
});

describe('unsafe request auto-retry', () => {
  it('auto-retries a generic 5xx for an unsafe request up to retryTimes', async () => {
    vi.useFakeTimers();
    try {
      const { adapter, calls } = failingAdapter(500);
      const client = createRequestClient();
      const retryConfig: RetryRequestConfig = { adapter, retryUnsafe: true, retryTimes: 2 };
      const pending = client.get('/x', retryConfig).catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      const error = await pending;

      expect(calls).toHaveLength(3); // 首次 + 2 次自动重试（复用同一请求配置/同一幂等键）
      expect((error as AxiosError).response?.status).toBe(500);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT auto-retry a corrupt idempotency result (deterministic 500)', async () => {
    const { adapter, calls } = failingAdapter(500, IDEMPOTENCY_RESULT_CORRUPT);
    const client = createRequestClient();
    const retryConfig: RetryRequestConfig = { adapter, retryUnsafe: true, retryTimes: 2 };
    const error = await client.get('/x', retryConfig).catch((err: unknown) => err);

    // 结果损坏必须立即交给上层（composable）阻塞意图并提示人工处理，不得重试
    expect(calls).toHaveLength(1);
    expect((error as AxiosError).response?.status).toBe(500);
  });
});
