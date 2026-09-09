import { describe, expect, it } from 'vitest';
import { BcryptPasswordHasher } from '../bcrypt-password-hasher.js';

describe('BcryptPasswordHasher', () => {
  it('hashes passwords without retaining the plaintext and verifies them', async () => {
    const hasher = new BcryptPasswordHasher();

    const passwordHash = await hasher.hash('correct-horse-battery-staple');

    expect(passwordHash).not.toBe('correct-horse-battery-staple');
    expect(passwordHash).toMatch(/^\$2[aby]\$/);
    await expect(hasher.verify('correct-horse-battery-staple', passwordHash)).resolves.toBe(true);
    await expect(hasher.verify('wrong-password', passwordHash)).resolves.toBe(false);
  });

  it('rejects malformed hashes rather than treating them as valid credentials', async () => {
    const hasher = new BcryptPasswordHasher();

    await expect(hasher.verify('password', 'not-a-bcrypt-hash')).resolves.toBe(false);
  });
});
