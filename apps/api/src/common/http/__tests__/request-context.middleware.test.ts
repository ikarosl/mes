import { describe, expect, it, vi } from 'vitest';
import { requestContextMiddleware } from '../request-context.middleware.js';
import { boundedHeader } from '../../security/auth.decorators.js';

describe('requestContextMiddleware', () => {
  it('keeps a valid request id on the request and response', () => {
    const request = { headers: { 'x-request-id': 'request_1234' } };
    const response = { setHeader: vi.fn() };
    const next = vi.fn();
    requestContextMiddleware(request as never, response as never, next);
    expect(request).toMatchObject({ requestId: 'request_1234' });
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', 'request_1234');
  });

  it('replaces an invalid request id', () => {
    const request = { headers: { 'x-request-id': 'bad' } };
    const response = { setHeader: vi.fn() };
    requestContextMiddleware(request as never, response as never, vi.fn());
    expect(request).toMatchObject({ requestId: expect.stringMatching(/^[A-Za-z0-9_-]{8,128}$/) });
  });

  it('bounds untrusted audit headers to their database limit', () => {
    expect(boundedHeader('x'.repeat(600), 512)).toHaveLength(512);
  });
});
