import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { PageQueryDto } from '../dto/page-query.dto.js';

describe('PageQueryDto', () => {
  it('uses the shared defaults', async () => {
    const dto = plainToInstance(PageQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toEqual({ page: 1, pageSize: 10 });
  });

  it.each([
    [{ page: '0' }, 'page'],
    [{ page: '1.5' }, 'page'],
    [{ pageSize: '0' }, 'pageSize'],
    [{ pageSize: '101' }, 'pageSize'],
    [{ pageSize: 'invalid' }, 'pageSize'],
  ])('rejects invalid pagination input %o', async (input, property) => {
    const errors = await validate(plainToInstance(PageQueryDto, input));
    expect(errors.some((error) => error.property === property)).toBe(true);
  });

  it('accepts the supported upper bound', async () => {
    const dto = plainToInstance(PageQueryDto, { page: '2', pageSize: '100' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toEqual({ page: 2, pageSize: 100 });
  });
});
