import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreatePurchaseInboundDto } from '../production-inbound.dto.js';
describe('CreatePurchaseInboundDto', () => {
  it('rejects empty details and non-positive quantities', async () => {
    expect(
      await validate(plainToInstance(CreatePurchaseInboundDto, { details: [] })),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(CreatePurchaseInboundDto, {
          details: [{ itemId: '1', batchCode: 'B', inboundQuantity: 0 }],
        }),
      ),
    ).not.toHaveLength(0);
  });

  it('accepts positive integers and rejects fractional inbound quantities', async () => {
    const line = { itemId: '1', materialVariantId: 'v1', batchCode: 'B' };
    expect(
      await validate(
        plainToInstance(CreatePurchaseInboundDto, {
          details: [{ ...line, inboundQuantity: 1 }],
        }),
      ),
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(CreatePurchaseInboundDto, {
          details: [{ ...line, inboundQuantity: 1.5 }],
        }),
      ),
    ).not.toEqual([]);
  });
});
