import { describe, expect, it } from 'vitest';
import { permissionMatches } from '../index.js';

describe('permissionMatches', () => {
  it('supports exact and scoped wildcard permissions', () => {
    expect(permissionMatches(['system:*'], 'system:user:view')).toBe(true);
    expect(permissionMatches(['system:user:view'], 'system:user:update')).toBe(false);
    expect(permissionMatches(['*'], 'anything')).toBe(true);
  });
});
