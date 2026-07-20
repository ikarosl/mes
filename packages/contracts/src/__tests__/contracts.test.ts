import { describe, expect, it } from 'vitest';
import { AUTH_API } from '../index.js';

describe('auth contract', () => {
  it('keeps refresh under auth cookie path', () => expect(AUTH_API.refresh).toBe('/auth/refresh'));
});
