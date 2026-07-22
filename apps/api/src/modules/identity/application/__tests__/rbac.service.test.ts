import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { RbacService } from '../rbac.service.js';

describe('RbacService system mutations', () => {
  it('hashes reset passwords and never passes plaintext to the repository', async () => {
    const repository = {
      resetUserPassword: vi.fn().mockResolvedValue(true),
    };
    const service = new RbacService(repository as never, {} as never);

    await service.resetUserPassword('7', 'strong-password-123', {
      userId: '1',
      ip: '127.0.0.1',
    });

    const [, passwordHash] = repository.resetUserPassword.mock.calls[0] as [string, string];
    expect(passwordHash).not.toBe('strong-password-123');
    expect(passwordHash.startsWith('$2')).toBe(true);
  });

  it('rejects deleting a role that still has assigned users', async () => {
    const repository = { deleteRole: vi.fn().mockResolvedValue('in-use') };
    const service = new RbacService(repository as never, {} as never);

    await expect(service.deleteRole('2', { userId: '1', ip: '127.0.0.1' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
