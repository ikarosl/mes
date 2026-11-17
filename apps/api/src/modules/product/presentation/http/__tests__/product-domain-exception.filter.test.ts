import { describe, expect, it, vi } from 'vitest';
import { ProductDomainError } from '../../../domain/product.errors.js';
import { ProductDomainExceptionFilter } from '../product-domain-exception.filter.js';

const invoke = (exception: ProductDomainError) => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const setHeader = vi.fn();
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        originalUrl: '/api/product/products/6',
        headers: { 'x-request-id': 'request_1234' },
      }),
      getResponse: () => ({ status, setHeader }),
    }),
  };

  new ProductDomainExceptionFilter().catch(exception, host as never);
  return { json, status, setHeader };
};

describe('ProductDomainExceptionFilter', () => {
  it.each([
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['ROUTE_IN_USE', 409],
    // TODO(attachment-storage-error-envelope): 验证附件存储失败映射为安全的 HTTP 错误信封；高重要性：存储错误隔离与脱敏，Product 存储错误已迁至 Attachment 且正式测试暂缓；获正式测试授权后针对 Attachment 错误过滤器及业务下载链恢复。
    ['INVALID_INPUT', 400],
    ['INVALID_PRODUCT_KIND', 400],
  ] as const)('maps %s to the expected HTTP envelope', (code, expectedStatus) => {
    const { json, status, setHeader } = invoke(new ProductDomainError(code, '产品业务错误'));

    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'request_1234');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: expectedStatus,
        code,
        message: '产品业务错误',
        requestId: 'request_1234',
        path: '/api/product/products/6',
        timestamp: expect.stringMatching(/\+08:00$/),
      }),
    );
  });
});
