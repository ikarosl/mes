import { describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { AuthClient, type AuthSession } from '../index.js';

describe('AuthClient', () => {
  it('keeps the access token only in the injected memory session', async () => {
    let session: AuthSession | null = null;
    const api = {
      login: vi.fn().mockResolvedValue({
        user: { id: '1', username: 'a', displayName: 'A', roles: [], permissions: [] },
        accessToken: 'access',
        accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        refreshTokenExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      }),
      refresh: vi.fn(),
      logout: vi.fn(),
      me: vi.fn(),
    };
    const client = new AuthClient({
      request: axios.create(),
      api,
      getSession: () => session,
      setSession: (value) => {
        session = value;
      },
    });
    await client.login({ username: 'a', password: 'secret' });
    const currentSession = session as AuthSession | null;
    expect(currentSession?.accessToken).toBe('access');
  });
});
