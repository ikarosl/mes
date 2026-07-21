import { describe, expect, it } from 'vitest';
import { CreateUserDto } from '../../../modules/identity/presentation/http/dto/rbac.dto.js';
import { createValidationPipe } from '../validation.pipe.js';

describe('HTTP validation pipe', () => {
  it('returns the standard validation error for malformed DTO input', async () => {
    const pipe = createValidationPipe();

    await expect(
      pipe.transform(
        {
          username: null,
          password: 'short',
          displayName: {},
          roleIds: '1',
        },
        { type: 'body', metatype: CreateUserDto },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('removes no declared fields and rejects unknown fields', async () => {
    const pipe = createValidationPipe();
    await expect(
      pipe.transform(
        {
          username: 'operator',
          password: '123456789012',
          displayName: '操作员',
          roleIds: ['1'],
          isAdmin: true,
        },
        { type: 'body', metatype: CreateUserDto },
      ),
    ).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR', message: '请求包含未允许的字段：isAdmin' },
    });
  });
});
