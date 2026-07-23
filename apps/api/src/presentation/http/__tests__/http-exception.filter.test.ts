import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from '../http-exception.filter.js';

const invoke = (exception: unknown, url = '/api/system/users') => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const setHeader = vi.fn();
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: url, headers: { 'x-request-id': 'request_1234' } }),
      getResponse: () => ({ status, setHeader }),
    }),
  };

  new HttpExceptionFilter().catch(exception, host as never);
  return { json, status, setHeader };
};

describe('HttpExceptionFilter', () => {
  it('returns one safe envelope for expected HTTP exceptions', () => {
    const { json, status, setHeader } = invoke(new BadRequestException('参数错误'));

    expect(status).toHaveBeenCalledWith(400);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'request_1234');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        code: 'BAD_REQUEST',
        message: '参数错误',
        requestId: 'request_1234',
        path: '/api/system/users',
        timestamp: expect.stringMatching(/\+08:00$/),
      }),
    );
  });

  it('does not expose unexpected exception messages', () => {
    const { json } = invoke(new Error('SELECT password_hash FROM users'));

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: '服务器内部错误，请稍后重试',
      }),
    );
  });
});
