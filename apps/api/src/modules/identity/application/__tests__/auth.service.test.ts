import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth.service.js';
import type { AuthRepository } from '../ports/auth.repository.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { TokenService } from '../ports/token.service.js';

describe('AuthService token TTLs', () => {
  it('uses token-port expirations for response timestamps and the database record', async () => {
    const saveRefreshToken = vi.fn();
    const repository = {
      findCredentials: vi.fn().mockResolvedValue({
        id: '1',
        username: 'admin',
        passwordHash: 'stored-password-hash',
        displayName: 'Admin',
      }),
      findProfile: vi.fn().mockResolvedValue({
        id: '1',
        username: 'admin',
        displayName: 'Admin',
        roles: [],
        permissions: [],
      }),
      touchLastLogin: vi.fn(),
      saveRefreshToken,
    } as unknown as AuthRepository;
    const passwords = { verify: vi.fn().mockResolvedValue(true) } as unknown as PasswordHasher;
    const tokens = {
      issue: vi.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accessExpiresAt: new Date('2026-07-23T09:00:10.000Z'),
        refreshExpiresAt: new Date('2026-07-23T09:00:20.000Z'),
        refreshTokenId: 'refresh-token-id',
      }),
    } as unknown as TokenService;
    const service = new AuthService(repository, passwords, tokens);

    const result = await service.login({ username: 'admin', password: 'secret' });
    const savedRecord = saveRefreshToken.mock.calls[0]?.[0] as { expiresAt: Date };

    expect(result.response.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(result.response.accessTokenExpiresAt).toBe('2026-07-23T17:00:10.000+08:00');
    expect(result.response.refreshTokenExpiresAt).toBe('2026-07-23T17:00:20.000+08:00');
    expect(savedRecord.expiresAt.toISOString()).toBe('2026-07-23T09:00:20.000Z');
  });
});
