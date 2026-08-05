import { type Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, permissionMatches } from '@company/constants';
import type { AuthService } from '../../../application/auth.service.js';
import type { AuditRepository } from '../../../application/ports/audit.repository.js';
import { AuthGuard } from '../auth.guard.js';

const categoryOptionsPermissions = [
  PERMISSIONS.product.products.view,
  PERMISSIONS.product.categories.view,
];

const mountGuard = (permissions: string[]) => {
  const writeLog = vi.fn();
  const reflector = {
    getAllAndOverride: vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(categoryOptionsPermissions),
  } as unknown as Reflector;
  const auth = {
    authenticate: vi.fn().mockResolvedValue({ id: '9', permissions }),
  } as unknown as AuthService;
  const guard = new AuthGuard(reflector, auth, { writeLog } as unknown as AuditRepository);
  const request = {
    headers: { authorization: 'Bearer token' },
    method: 'GET',
    path: '/api/product/categories/options',
    ip: '127.0.0.1',
  };
  return {
    guard,
    writeLog,
    context: {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as never,
  };
};

describe('RBAC guard permission semantics', () => {
  it('denies a missing permission', () =>
    expect(permissionMatches(['system:user:view'], 'system:user:update')).toBe(false));

  it('records a denied permission check without trusting a forwarded-for header directly', async () => {
    const writeLog = vi.fn();
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce('system:user:update'),
    } as unknown as Reflector;
    const auth = {
      authenticate: vi.fn().mockResolvedValue({
        id: '2',
        permissions: ['system:user:view'],
      }),
    } as unknown as AuthService;
    const guard = new AuthGuard(reflector, auth, { writeLog } as unknown as AuditRepository);
    const request = {
      headers: { authorization: 'Bearer token', 'x-forwarded-for': '10.0.0.8' },
      method: 'PUT',
      path: '/api/system/users/1/roles',
      ip: '192.168.1.23',
    };

    await expect(
      guard.canActivate({
        getHandler: () => undefined,
        getClass: () => undefined,
        switchToHttp: () => ({ getRequest: () => request }),
      } as never),
    ).resolves.toBe(false);

    expect(writeLog).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'failed', ip: '192.168.1.23', remark: 'HTTP 403' }),
    );
  });

  it('lets a minimal product-only role read a cross-page any-of options endpoint', async () => {
    const { guard, context } = mountGuard([PERMISSIONS.product.products.view]);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('denies a role that matches none of the any-of permission set', async () => {
    const { guard, writeLog, context } = mountGuard([PERMISSIONS.product.processes.view]);
    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(writeLog).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'failed', remark: 'HTTP 403' }),
    );
  });
});
