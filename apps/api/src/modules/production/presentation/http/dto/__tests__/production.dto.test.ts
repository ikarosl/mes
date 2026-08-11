import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  AssignProductionStepDto,
  CreateProductionBatchDto,
  CreateWorkOrderDto,
  UpdateBatchStepExecutionDto,
  UpdateProductionBatchDto,
  UpdateWorkOrderDto,
} from '../production.dto.js';

describe('Production batch execution DTOs', () => {
  it('transforms and validates route-generated step overrides on batch creation', async () => {
    const dto = plainToInstance(CreateProductionBatchDto, {
      plannedQuantity: '10',
      stepOverrides: [{ routeStepId: '41', actualSopFileId: '7', responsibleUserId: '3' }],
    });

    expect(await validate(dto, { whitelist: true })).toEqual([]);
    expect(dto.stepOverrides?.[0]).toMatchObject({
      routeStepId: '41',
      actualSopFileId: '7',
    });
    expect(dto.stepOverrides?.[0]).not.toHaveProperty('responsibleUserId');
  });

  it('requires the step-record version for an execution override', async () => {
    const dto = plainToInstance(UpdateBatchStepExecutionDto, { actualSopFileId: '7' });

    expect((await validate(dto)).some((error) => error.property === 'version')).toBe(true);
  });

  it('requires both a responsible employee and version for assignment', async () => {
    const invalid = plainToInstance(AssignProductionStepDto, { responsibleUserId: '' });
    expect((await validate(invalid)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['responsibleUserId', 'version']),
    );
    const valid = plainToInstance(AssignProductionStepDto, {
      responsibleUserId: '7',
      version: 0,
    });
    expect(await validate(valid)).toEqual([]);
  });
});

describe('Production date-only DTO fields', () => {
  const cases: Array<[string, new () => object, Record<string, unknown>]> = [
    [
      'create work order',
      CreateWorkOrderDto,
      { workOrderNo: 'WO-001', productId: '8', plannedQuantity: 1 },
    ],
    ['update work order', UpdateWorkOrderDto, { version: 1 }],
    ['create batch', CreateProductionBatchDto, { plannedQuantity: 1 }],
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
});
