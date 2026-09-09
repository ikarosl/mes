import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  MaterialDto,
  MaterialVariantDto,
  ProcessRouteDto,
  ProductDto,
  ReplaceProductMaterialsDto,
} from '../product.dto.js';

describe('product quantity DTOs', () => {
  it('accepts integer BOM quantities and rejects fractional quantities', async () => {
    const base = {
      materialId: '2',
      unit: 'pcs',
      isKeyMaterial: true,
      needBatchRecord: true,
    };
    expect(
      await validate(
        plainToInstance(ReplaceProductMaterialsDto, {
          items: [{ ...base, quantityPerUnit: 2 }],
        }),
      ),
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(ReplaceProductMaterialsDto, {
          items: [{ ...base, quantityPerUnit: 1.5 }],
        }),
      ),
    ).not.toEqual([]);
    expect(
      await validate(
        plainToInstance(ReplaceProductMaterialsDto, {
          items: [{ ...base, materialId: undefined, materialProductId: '2', quantityPerUnit: 2 }],
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

describe('Product material and independent route DTOs', () => {
  it('validates material CRUD payloads and exact versions by stable materialId', async () => {
    const material = plainToInstance(MaterialDto, {
      materialCode: 'M-1',
      materialName: '微带',
      categoryId: '3',
      unit: 'pcs',
      acquireMethod: 'purchased',
      status: 1,
    });
    const variant = plainToInstance(MaterialVariantDto, {
      materialId: '3',
      majorVersion: '1',
      minorVersion: '0',
    });

    expect(await validate(material)).toEqual([]);
    expect(await validate(variant)).toEqual([]);
    expect(variant.materialId).toBe('3');
    expect('materialProductId' in variant).toBe(false);
  });

  it('models routes independently without requiring a product id', async () => {
    const route = plainToInstance(ProcessRouteDto, {
      routeCode: 'R-1',
      routeName: '路线',
      versionNo: 'V1',
    });

    expect(await validate(route)).toEqual([]);
    expect(route).not.toHaveProperty('productId');
  });
});
