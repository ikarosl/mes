import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TokenResponse } from '@company/contracts';
import type { AuthService } from '../../../application/auth.service.js';
import { AuthController } from '../auth.controller.js';

describe('AuthController refresh cookie', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses the configured refresh TTL as the cookie max age', async () => {
    vi.stubEnv('JWT_SECRET', 'test-secret-with-at-least-32-characters');
    vi.stubEnv('JWT_ISSUER', 'test-issuer');
    vi.stubEnv('JWT_AUDIENCE', 'test-audience');
    vi.stubEnv('REFRESH_TOKEN_TTL_SECONDS', '10');
    const responseBody = {
      user: { id: '1', username: 'admin', displayName: 'Admin', roles: [], permissions: [] },
      accessToken: 'access',
      accessTokenExpiresAt: '2026-07-23T09:00:10.000Z',
      refreshTokenExpiresAt: '2026-07-23T09:00:10.000Z',
    } satisfies TokenResponse;
    const auth = {
      login: vi.fn().mockResolvedValue({ response: responseBody, refreshToken: 'refresh' }),
    } as unknown as AuthService;
    const cookie = vi.fn();
    const controller = new AuthController(auth);

    await controller.login(
      { username: 'admin', password: 'secret' },
      { cookie, clearCookie: vi.fn() },
    );

    expect(cookie).toHaveBeenCalledWith(
      'company_refresh_token',
      'refresh',
      expect.objectContaining({ maxAge: 10_000 }),
    );
  });
});
