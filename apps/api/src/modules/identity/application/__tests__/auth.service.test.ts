import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { decodeJwt } from 'jose';
import { AuthService } from '../auth.service.js';
import type { IdentityRepository } from '../ports/identity.repository.js';

describe('AuthService token TTLs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T09:00:00.000Z'));
    vi.stubEnv('JWT_SECRET', 'test-secret-with-at-least-32-characters');
    vi.stubEnv('JWT_ISSUER', 'test-issuer');
    vi.stubEnv('JWT_AUDIENCE', 'test-audience');
    vi.stubEnv('ACCESS_TOKEN_TTL_SECONDS', '10');
    vi.stubEnv('REFRESH_TOKEN_TTL_SECONDS', '20');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('uses configured TTLs for JWTs, response timestamps and the database record', async () => {
    const saveRefreshToken = vi.fn();
    const repository = {
      findCredentials: vi.fn().mockResolvedValue({
        id: '1',
        username: 'admin',
        passwordHash: bcrypt.hashSync('secret', 4),
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
    } as unknown as IdentityRepository;
    const service = new AuthService(repository);

    const result = await service.login({ username: 'admin', password: 'secret' });
    const accessClaims = decodeJwt(result.response.accessToken);
    const refreshClaims = decodeJwt(result.refreshToken);
    const savedRecord = saveRefreshToken.mock.calls[0]?.[0] as { expiresAt: Date };

    expect(accessClaims.exp! - accessClaims.iat!).toBe(10);
    expect(refreshClaims.exp! - refreshClaims.iat!).toBe(20);
    expect(result.response.accessTokenExpiresAt).toBe('2026-07-23T17:00:10.000+08:00');
    expect(result.response.refreshTokenExpiresAt).toBe('2026-07-23T17:00:20.000+08:00');
    expect(savedRecord.expiresAt.toISOString()).toBe('2026-07-23T09:00:20.000Z');
  });
});
