import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { CommandContext } from '../../../../../common/audit/audit.types.js';
import { RbacController } from '../rbac.controller.js';

const audit: CommandContext = {
  actorId: '1',
  requestId: 'req-1',
  ip: '127.0.0.1',
  userAgent: null,
};

describe('RbacController write result mapping', () => {
  it('maps not-found to NotFoundException', async () => {
    const service = { setUserStatus: vi.fn().mockResolvedValue({ status: 'not-found' }) };
    const controller = new RbacController(service as never);

    await expect(
      controller.setUserStatus({ id: '999' }, { status: 1 }, audit),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps invalid-input to BadRequestException with the service message', async () => {
    const service = {
      createUser: vi
        .fn()
        .mockResolvedValue({ status: 'invalid-input', message: '用户名、姓名必填，密码至少 6 位' }),
    };
    const controller = new RbacController(service as never);

    await expect(
      controller.createUser(
        { username: '   ', password: '123456', displayName: '管理员', roleIds: [] },
        audit,
      ),
    ).rejects.toMatchObject({ response: { message: '用户名、姓名必填，密码至少 6 位' } });
  });

  it('maps invalid-reference to BadRequestException with the repository message', async () => {
    const service = {
      setUserRoles: vi
        .fn()
        .mockResolvedValue({ status: 'invalid-reference', message: '包含无效的角色引用：999' }),
    };
    const controller = new RbacController(service as never);

    await expect(
      controller.setUserRoles({ id: '10' }, { roleIds: ['999'] }, audit),
    ).rejects.toMatchObject({ response: { message: '包含无效的角色引用：999' } });
  });

  it('maps conflict to ConflictException with the repository message', async () => {
    const service = {
      createRole: vi.fn().mockResolvedValue({ status: 'conflict', message: '角色编码已存在' }),
    };
    const controller = new RbacController(service as never);

    await expect(
      controller.createRole({ name: '管理员', code: 'admin' }, audit),
    ).rejects.toMatchObject({ response: { message: '角色编码已存在' } });
  });

  it('returns the created id on success for createUser', async () => {
    const service = {
      createUser: vi.fn().mockResolvedValue({ status: 'success', value: '7' }),
    };
    const controller = new RbacController(service as never);

    await expect(
      controller.createUser(
        { username: 'a', password: '123456', displayName: 'A', roleIds: [] },
        audit,
      ),
    ).resolves.toEqual({ id: '7' });
  });

  it('returns undefined on success for void writes', async () => {
    const service = {
      setUserStatus: vi.fn().mockResolvedValue({ status: 'success', value: undefined }),
    };
    const controller = new RbacController(service as never);

    await expect(
      controller.setUserStatus({ id: '7' }, { status: 1 }, audit),
    ).resolves.toBeUndefined();
  });

  it('maps a missing role to NotFoundException for the permission read', async () => {
    const service = { getRolePermissions: vi.fn().mockResolvedValue(null) };
    const controller = new RbacController(service as never);

    await expect(controller.rolePermissions({ id: '999' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
