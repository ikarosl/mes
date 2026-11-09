import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  CancelWorkOrderDto,
  CreateProductionBatchDto,
  CreateWorkOrderDto,
  UpdateProductionBatchDto,
  UpdateWorkOrderDto,
} from '../production.dto.js';

describe('Work-order terminal command DTOs', () => {
  it('requires a version and cancellation reason', async () => {
    const valid = plainToInstance(CancelWorkOrderDto, { version: 2, reason: '计划取消' });
    expect(await validate(valid)).toEqual([]);

    const invalid = plainToInstance(CancelWorkOrderDto, { version: 2, reason: '' });
    expect((await validate(invalid)).some((error) => error.property === 'reason')).toBe(true);
  });
});

// TODO(production-tracking-dto): 验证人员身份、版本及整数数量边界；高重要性，旧派工及补产DTO已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按追踪卡新命令契约恢复。

// TODO(production-tracking-dto): 验证人员身份、版本及整数数量边界；高重要性，旧派工及补产DTO已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按追踪卡新命令契约恢复。

// TODO(production-tracking-dto): 验证人员身份、版本及整数数量边界；高重要性，旧派工及补产DTO已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按追踪卡新命令契约恢复。

describe('Production date-only DTO fields', () => {
  const cases: Array<[string, new () => object, Record<string, unknown>]> = [
    [
      'create work order',
      CreateWorkOrderDto,
      {
        orderType: 'mass_production',
        productId: '8',
        plannedQuantity: 1,
        planEndDate: '2024-03-01',
      },
    ],
    ['update work order', UpdateWorkOrderDto, { version: 1 }],
    ['create batch', CreateProductionBatchDto, { plannedQuantity: 1, ownerId: '3' }],
    ['update batch', UpdateProductionBatchDto, { version: 1 }],
  ];

  it.each(cases)('rejects malformed and impossible dates for %s', async (_name, Dto, base) => {
    for (const planStartDate of ['abcdefghij', '2026-02-30', '2026-08-01T12:00:00Z']) {
      const errors = await validate(plainToInstance(Dto, { ...base, planStartDate }));
      expect(errors.some((error) => error.property === 'planStartDate')).toBe(true);
    }
  });

  it.each(cases)('accepts a valid leap-day date for %s', async (_name, Dto, base) => {
    const dto = plainToInstance(Dto, { ...base, planStartDate: '2024-02-29' });

    expect(await validate(dto)).toEqual([]);
  });

  it('requires both work-order plan dates on creation', async () => {
    const dto = plainToInstance(CreateWorkOrderDto, {
      productId: '8',
      plannedQuantity: 1,
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['planStartDate', 'planEndDate']),
    );
  });
});

describe('Production batch creation DTO', () => {
  it('transforms and validates route-generated step overrides on batch creation', async () => {
    const dto = plainToInstance(CreateProductionBatchDto, {
      plannedQuantity: '10',
      ownerId: '3',
      stepOverrides: [{ routeStepId: '41', actualSopFileId: '7', responsibleUserId: '3' }],
    });

    expect(await validate(dto, { whitelist: true })).toEqual([]);
    expect(dto.stepOverrides?.[0]).toMatchObject({
      routeStepId: '41',
      actualSopFileId: '7',
    });
    expect(dto.stepOverrides?.[0]).not.toHaveProperty('responsibleUserId');
  });
});
