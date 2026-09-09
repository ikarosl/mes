import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeJwt } from 'jose';
import { AuthenticationError } from '../../domain/auth.errors.js';
import { JwtTokenService } from '../jwt-token.service.js';

describe('JwtTokenService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T09:00:00.000Z'));
    vi.stubEnv('JWT_SECRET', 'test-secret-with-at-least-32-characters');
    vi.stubEnv('JWT_ISSUER', 'test-issuer');
    vi.stubEnv('JWT_AUDIENCE', 'test-audience');
    vi.stubEnv('ACCESS_TOKEN_TTL_SECONDS', '60');
    vi.stubEnv('REFRESH_TOKEN_TTL_SECONDS', '120');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('issues typed access and refresh tokens with configured TTLs and a refresh jti', async () => {
    const service = new JwtTokenService();

    const pair = await service.issue({ id: '7', username: 'worker' });
    const accessClaims = decodeJwt(pair.accessToken);
    const refreshClaims = decodeJwt(pair.refreshToken);

    expect(accessClaims).toMatchObject({
      sub: '7',
      username: 'worker',
      kind: 'access',
      iss: 'test-issuer',
      aud: 'test-audience',
    });
    expect(accessClaims.exp! - accessClaims.iat!).toBe(60);
    expect(accessClaims.jti).toBeUndefined();
    expect(refreshClaims).toMatchObject({
      sub: '7',
      username: 'worker',
      kind: 'refresh',
      iss: 'test-issuer',
      aud: 'test-audience',
    });
    expect(refreshClaims.exp! - refreshClaims.iat!).toBe(120);
    expect(refreshClaims.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(pair.refreshTokenId).toBe(refreshClaims.jti);
    expect(pair.accessExpiresAt.toISOString()).toBe('2026-07-23T09:01:00.000Z');
    expect(pair.refreshExpiresAt.toISOString()).toBe('2026-07-23T09:02:00.000Z');
  });

  it('verifies access and refresh identities while returning only refresh jti', async () => {
    const service = new JwtTokenService();
    const pair = await service.issue({ id: '7', username: 'worker' });

    await expect(service.verify(pair.accessToken, 'access')).resolves.toEqual({ userId: '7' });
    await expect(service.verify(pair.refreshToken, 'refresh')).resolves.toEqual({
      userId: '7',
      tokenId: pair.refreshTokenId,
    });
  });

  it.each([
    ['malformed token', () => 'not-a-jwt'],
    [
      'wrong token kind',
      async (service: JwtTokenService) =>
        (await service.issue({ id: '7', username: 'worker' })).accessToken,
    ],
  ])('maps %s to a stable authentication error', async (_label, tokenFactory) => {
    const service = new JwtTokenService();
    const token = await tokenFactory(service);

    await expect(service.verify(token, 'refresh')).rejects.toBeInstanceOf(AuthenticationError);
    await expect(service.verify(token, 'refresh')).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });

  it('rejects an expired token', async () => {
    const service = new JwtTokenService();
    const pair = await service.issue({ id: '7', username: 'worker' });

    vi.advanceTimersByTime(61_000);

    await expect(service.verify(pair.accessToken, 'access')).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });
});
