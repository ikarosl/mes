import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const httpClientMock = {
  request: vi.fn(),
  interceptors: {
    request: { use: vi.fn(), eject: vi.fn(), clear: vi.fn() },
    response: { use: vi.fn(), eject: vi.fn(), clear: vi.fn() },
  },
  defaults: { headers: { common: {} } },
  get: vi.fn(),
  post: vi.fn(),
};

vi.mock('../http', () => ({ httpClient: httpClientMock }));

describe('authApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    httpClientMock.request.mockResolvedValue({ data: undefined });
  });

  it('sends login with credentials and skip-auth flags', async () => {
    const { authApi } = await import('../auth');
    httpClientMock.request.mockResolvedValue({
      data: {
        accessToken: 'jwt-xxx',
        user: {
          id: '1',
          username: 'admin',
          displayName: '管理员',
          roles: ['admin'],
          permissions: ['*'],
        },
      },
    });

    const result = await authApi.login({ username: 'admin', password: 'secret' });

    expect(httpClientMock.request).toHaveBeenCalledWith({
      url: '/auth/login',
      method: 'POST',
      data: { username: 'admin', password: 'secret' },
      skipAuth: true,
      skipRefresh: true,
      preserveErrorMessage: true,
      withCredentials: true,
      skipRetry: true,
    });
    expect(result.accessToken).toBe('jwt-xxx');
  });

  it('sends refresh with POST and cookie flags', async () => {
    const { authApi } = await import('../auth');

    await authApi.refresh();

    expect(httpClientMock.request).toHaveBeenCalledWith({
      url: '/auth/refresh',
      method: 'POST',
      skipAuth: true,
      skipRefresh: true,
      withCredentials: true,
      skipRetry: true,
      skipErrorHandling: true,
    });
  });

  it('sends logout with POST', async () => {
    const { authApi } = await import('../auth');

    await authApi.logout();

    expect(httpClientMock.request).toHaveBeenCalledWith({
      url: '/auth/logout',
      method: 'POST',
      skipAuth: true,
      skipRefresh: true,
      withCredentials: true,
      skipRetry: true,
    });
  });

  it('requests current user profile', async () => {
    const { authApi } = await import('../auth');

    await authApi.me();

    expect(httpClientMock.request).toHaveBeenCalledWith({
      url: '/auth/me',
      method: 'GET',
    });
  });

  it('creates an auth client with session accessors', async () => {
    const { createAuthClient } = await import('../auth');
    const getSession = vi.fn();
    const setSession = vi.fn();

    const client = createAuthClient({ getSession, setSession });

    expect(client).toBeDefined();
    expect(typeof client.login).toBe('function');
    expect(typeof client.logout).toBe('function');
  });

  it('handles 401 login failure via toRequestError', async () => {
    httpClientMock.request.mockRejectedValue(
      new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 401,
        data: { code: 'INVALID_CREDENTIALS', message: '用户名或密码错误' },
      } as unknown as AxiosResponse),
    );
    const { authApi } = await import('../auth');

    await expect(authApi.login({ username: 'bad', password: 'wrong' })).rejects.toThrow();
  });
});
