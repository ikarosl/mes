import { describe, expect, it } from 'vitest';
import { permissionMatches } from '@company/constants';

describe('RBAC guard permission semantics', () => {
  it('denies a missing permission', () =>
    expect(permissionMatches(['system:user:view'], 'system:user:update')).toBe(false));
});
