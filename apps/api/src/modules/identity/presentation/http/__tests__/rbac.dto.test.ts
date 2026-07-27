import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateUserDto, OperationLogQueryDto, ResetUserPasswordDto } from '../dto/rbac.dto.js';

describe('OperationLogQueryDto', () => {
  it('accepts shared operation result codes', async () => {
    const dto = Object.assign(new OperationLogQueryDto(), { result: 'success' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'result')).toBe(false);
  });

  it('rejects arbitrary operation result strings', async () => {
    const dto = Object.assign(new OperationLogQueryDto(), { result: '成功' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'result')).toBe(true);
  });
});

describe('development password validation', () => {
  it('accepts the configured six-character password for user creation and reset', async () => {
    const createDto = Object.assign(new CreateUserDto(), {
      username: 'admin',
      password: '123456',
      displayName: '系统管理员',
      roleIds: [],
      isAdmin: true,
    });
    const resetDto = Object.assign(new ResetUserPasswordDto(), { password: '123456' });

    expect((await validate(createDto)).some((error) => error.property === 'password')).toBe(false);
    expect((await validate(resetDto)).some((error) => error.property === 'password')).toBe(false);
  });

  it('retains a basic six-character minimum', async () => {
    const dto = Object.assign(new ResetUserPasswordDto(), { password: '12345' });
    expect((await validate(dto)).some((error) => error.property === 'password')).toBe(true);
  });
});
