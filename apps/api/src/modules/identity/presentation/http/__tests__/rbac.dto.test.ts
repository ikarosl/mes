import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { describe, expect, it } from 'vitest';
import {
  CreateUserDto,
  OperationLogQueryDto,
  ResetUserPasswordDto,
  SystemUserQueryDto,
} from '../dto/rbac.dto.js';

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

describe('SystemUserQueryDto', () => {
  it('transforms and accepts valid page and status filters', async () => {
    const dto = plainToInstance(SystemUserQueryDto, { page: '2', pageSize: '20', status: '1' });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ page: 2, pageSize: 20, status: 1 });
  });

  it('rejects an invalid role id and status', async () => {
    const dto = plainToInstance(SystemUserQueryDto, { roleId: 'abc', status: '9' });
    const properties = (await validate(dto)).map((error) => error.property);
    expect(properties).toEqual(expect.arrayContaining(['roleId', 'status']));
  });
});
