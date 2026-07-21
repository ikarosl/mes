import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { permissionMatches } from '@company/constants';
import type { AuthService } from '../../../application/auth.service.js';
import type { AuditRepository } from '../../../application/ports/audit.repository.js';
import { AuthGuard } from '../auth.guard.js';

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
});
