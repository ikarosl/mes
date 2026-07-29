import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateProductionBatchDto, UpdateBatchStepExecutionDto } from '../production.dto.js';

describe('Production batch execution DTOs', () => {
  it('transforms and validates route-generated step overrides on batch creation', async () => {
    const dto = plainToInstance(CreateProductionBatchDto, {
      plannedQuantity: '10',
      stepOverrides: [{ routeStepId: '41', actualSopFileId: '7', responsibleUserId: '3' }],
    });

    expect(await validate(dto)).toEqual([]);
    expect(dto.stepOverrides?.[0]).toMatchObject({
      routeStepId: '41',
      actualSopFileId: '7',
      responsibleUserId: '3',
    });
  });

  it('requires the step-record version for an execution override', async () => {
    const dto = plainToInstance(UpdateBatchStepExecutionDto, { actualSopFileId: '7' });

    expect((await validate(dto)).some((error) => error.property === 'version')).toBe(true);
  });
});
