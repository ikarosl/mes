import { describe, expect, it } from 'vitest';
import { canRetryRequest, toRequestError } from '../index.js';

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
