import { beforeEach, describe, expect, it, vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../http', () => ({ httpClient: { request } }));

describe('systemApi contract mapping', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ data: undefined });
  });

  it('uses dedicated permission-protected user mutation routes', async () => {
    const { systemApi } = await import('../system');

    await systemApi.updateUser('9', { displayName: '新姓名' });
    await systemApi.resetUserPassword('9', { password: 'strong-password-123' });
    await systemApi.setUserRoles('9', { roleIds: ['2'] });

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/system/users/9',
      method: 'PATCH',
      data: { displayName: '新姓名' },
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      url: '/system/users/9/password',
      method: 'PATCH',
      data: { password: 'strong-password-123' },
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      url: '/system/users/9/roles',
      method: 'PUT',
      data: { roleIds: ['2'] },
    });
  });

  it('passes log filters as query parameters', async () => {
    request.mockResolvedValue({ data: { items: [], total: 0, page: 2, pageSize: 10 } });
    const { systemApi } = await import('../system');

    await systemApi.logs({ page: 2, pageSize: 10, module: 'system' });

    expect(request).toHaveBeenCalledWith({
      url: '/system/logs',
      params: { page: 2, pageSize: 10, module: 'system' },
    });
  });
});
