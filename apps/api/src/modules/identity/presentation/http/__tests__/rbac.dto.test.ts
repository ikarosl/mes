import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { OperationLogQueryDto } from '../dto/rbac.dto.js';

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
