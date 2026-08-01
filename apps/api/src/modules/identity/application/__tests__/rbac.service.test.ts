import { describe, expect, it, vi } from 'vitest';
import { RbacService } from '../rbac.service.js';

describe('RbacService system mutations', () => {
  it('hashes reset passwords and never passes plaintext to the repository', async () => {
    const repository = {
      resetUserPassword: vi.fn().mockResolvedValue({ status: 'success', value: undefined }),
    };
    const service = new RbacService(repository as never, {} as never);

    const result = await service.resetUserPassword('7', '123456', {
      userId: '1',
      ip: '127.0.0.1',
    });

    expect(result).toEqual({ status: 'success', value: undefined });
    const [, passwordHash] = repository.resetUserPassword.mock.calls[0] as [string, string];
    expect(passwordHash).not.toBe('123456');
    expect(passwordHash.startsWith('$2')).toBe(true);
  });

  it('passes through repository write results without translating to HTTP exceptions', async () => {
    const repository = {
      createUser: vi.fn().mockResolvedValue({ status: 'conflict', message: '用户名已存在' }),
      setUserRoles: vi.fn().mockResolvedValue({ status: 'not-found' }),
      setRolePermissions: vi.fn().mockResolvedValue({
        status: 'invalid-reference',
        message: '包含无效的权限引用',
      }),
    };
    const service = new RbacService(repository as never, {} as never);

    await expect(
      service.createUser(
        { username: 'admin', displayName: '管理员', password: '123456', roleIds: [] },
        { userId: '1', ip: '127.0.0.1' },
      ),
    ).resolves.toEqual({ status: 'conflict', message: '用户名已存在' });
    await expect(service.setUserRoles('9', [], { userId: '1', ip: '127.0.0.1' })).resolves.toEqual({
      status: 'not-found',
    });
    await expect(
      service.setRolePermissions('9', ['99'], { userId: '1', ip: '127.0.0.1' }),
    ).resolves.toEqual({ status: 'invalid-reference', message: '包含无效的权限引用' });
  });

  it('rejects blank names and illegal status with invalid-input without calling the repository', async () => {
    const repository = {
      createUser: vi.fn(),
      updateRole: vi.fn(),
      setUserStatus: vi.fn(),
      resetUserPassword: vi.fn(),
    };
    const service = new RbacService(repository as never, {} as never);
    const context = { userId: '1', ip: '127.0.0.1' };

    await expect(
      service.createUser(
        { username: '   ', displayName: '管理员', password: '123456', roleIds: [] },
        context,
      ),
    ).resolves.toEqual({ status: 'invalid-input', message: '用户名、姓名必填，密码至少 6 位' });
    await expect(service.setUserStatus('7', 2, context)).resolves.toEqual({
      status: 'invalid-input',
      message: '状态无效',
    });
    await expect(service.updateRole('7', { name: '  ' }, context)).resolves.toEqual({
      status: 'invalid-input',
      message: '角色名称不能为空',
    });
    await expect(service.resetUserPassword('7', '12345', context)).resolves.toEqual({
      status: 'invalid-input',
      message: '密码至少 6 位',
    });

    expect(repository.createUser).not.toHaveBeenCalled();
    expect(repository.updateRole).not.toHaveBeenCalled();
    expect(repository.setUserStatus).not.toHaveBeenCalled();
    expect(repository.resetUserPassword).not.toHaveBeenCalled();
  });

  it('returns the conflict result when deleting a role that still has assigned users', async () => {
    const repository = {
      deleteRole: vi
        .fn()
        .mockResolvedValue({ status: 'conflict', message: '角色仍有关联用户，不能删除' }),
    };
    const service = new RbacService(repository as never, {} as never);

    await expect(service.deleteRole('2', { userId: '1', ip: '127.0.0.1' })).resolves.toEqual({
      status: 'conflict',
      message: '角色仍有关联用户，不能删除',
    });
  });
});
