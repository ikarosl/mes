import { describe, expect, it } from 'vitest';
import { checksum } from '../migration-utils.js';

describe('migration checksum', () => {
  it('is deterministic and detects content changes', () => {
    expect(checksum('SELECT 1')).toBe(checksum('SELECT 1'));
    expect(checksum('SELECT 1')).not.toBe(checksum('SELECT 2'));
  });
});
