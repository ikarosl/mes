import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  CreateMaterialLossDto,
  CreateReturnOrderDto,
  SaveStockCheckCountsDto,
} from '../warehouse.dto.js';

describe('warehouse quantity DTOs', () => {
  it('rejects fractional return and material-loss quantities', async () => {
    expect(
      await validate(
        plainToInstance(CreateReturnOrderDto, {
          productionBatchId: '1',
          details: [{ allocationId: '2', returnQuantity: 1.5 }],
        }),
      ),
    ).not.toEqual([]);
    expect(
      await validate(
        plainToInstance(CreateMaterialLossDto, {
          productionBatchId: '1',
          allocationId: '2',
          scrapQuantity: 1.5,
          reasonType: 'damaged',
        }),
      ),
    ).not.toEqual([]);
  });

  it('accepts zero integer stock counts and rejects fractional counts', async () => {
    const base = { version: 0, details: [{ detailId: '1', actualQuantity: 0 }] };
    expect(await validate(plainToInstance(SaveStockCheckCountsDto, base))).toEqual([]);
    expect(
      await validate(
        plainToInstance(SaveStockCheckCountsDto, {
          ...base,
          details: [{ detailId: '1', actualQuantity: 0.5 }],
        }),
      ),
    ).not.toEqual([]);
  });
});
