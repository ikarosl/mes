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
});
