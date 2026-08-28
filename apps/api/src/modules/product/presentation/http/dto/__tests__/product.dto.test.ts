import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ProductDto, ReplaceBomVersionLinesDto } from '../product.dto.js';

describe('product quantity DTOs', () => {
  it('accepts integer BOM quantities and rejects fractional quantities', async () => {
    const base = {
      materialProductId: '2',
      unit: 'pcs',
      isKeyMaterial: true,
      needBatchRecord: true,
    };
    expect(
      await validate(
        plainToInstance(ReplaceBomVersionLinesDto, {
          items: [{ ...base, quantityPerUnit: 2 }],
        }),
      ),
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(ReplaceBomVersionLinesDto, {
          items: [{ ...base, quantityPerUnit: 1.5 }],
        }),
      ),
    ).not.toEqual([]);
  });

  it('keeps product specification values as JSON records outside quantity arithmetic', async () => {
    const dto = plainToInstance(ProductDto, {
      itemCode: 'P-1',
      productName: '产品',
      categoryId: '1',
      unit: 'pcs',
      acquireMethod: 'self_made',
      status: 1,
      specValues: [{ key: '长度', value: '1.25', unit: 'mm' }],
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.specValues?.[0]?.value).toBe('1.25');
  });
});
