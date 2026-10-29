import { describe, expect, it } from 'vitest';
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
        data: {
          code: 'BAD_REQUEST',
          message: '参数错误',
          requestId: 'request_1234',
          details: { field: 'quantity' },
        },
      },
    };

    expect(toRequestError(error)).toMatchObject({
      name: 'RequestError',
      status: 400,
      code: 'BAD_REQUEST',
      requestId: 'request_1234',
      details: { field: 'quantity' },
      message: '参数错误',
    });
  });

  it('retries only safe methods', () => {
    expect(canRetryRequest('GET')).toBe(true);
    expect(canRetryRequest('post')).toBe(false);
    expect(canRetryRequest('PATCH')).toBe(false);
  });
});

describe('unsafe request auto-retry', () => {
  it('does NOT auto-retry a deterministic 500 for an unsafe request', async () => {
    const { adapter, calls } = failingAdapter(500);
    const client = createRequestClient();
    const retryConfig: RetryRequestConfig = {
      adapter,
      headers: { 'Idempotency-Key': 'key-1' },
      retryTimes: 2,
    };
    const error = await client.post('/x', {}, retryConfig).catch((err: unknown) => err);

    expect(calls).toHaveLength(1);
    expect((error as AxiosError).response?.status).toBe(500);
  });

  // TODO(request-retry): 验证携带幂等键或残留旧重试配置的写请求在网络、超时和 5xx 失败后均不重试；
  // 该边界保护提交意图，旧自动重试用例随废弃能力删除；用户明确授权正式测试后补齐覆盖。

  it('does NOT auto-retry an unsafe request without an idempotency key', async () => {
    const { adapter, calls } = failingAdapter(503);
    const client = createRequestClient();
    const retryConfig: RetryRequestConfig = {
      adapter,
      retryTimes: 2,
    };
    const error = await client.post('/x', {}, retryConfig).catch((err: unknown) => err);

    expect(calls).toHaveLength(1);
    expect((error as AxiosError).response?.status).toBe(503);
  });

  it('does NOT auto-retry a corrupt idempotency result (deterministic 500)', async () => {
    const { adapter, calls } = failingAdapter(500, IDEMPOTENCY_RESULT_CORRUPT);
    const client = createRequestClient();
    const retryConfig: RetryRequestConfig = {
      adapter,
      headers: { 'Idempotency-Key': 'key-1' },
      retryTimes: 2,
    };
    const error = await client.get('/x', retryConfig).catch((err: unknown) => err);

    // 结果损坏必须立即交给上层（composable）阻塞意图并提示人工处理，不得重试
    expect(calls).toHaveLength(1);
    expect((error as AxiosError).response?.status).toBe(500);
  });
});
