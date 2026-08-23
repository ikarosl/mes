import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  CreateMaterialAllocationsDto,
  CreateMaterialOutboundDto,
} from '../production-material.dto.js';

describe('production material DTOs', () => {
  it('requires non-empty positive integer allocation lines', async () => {
    expect(
      await validate(
        plainToInstance(CreateMaterialAllocationsDto, {
          allocations: [{ demandId: '1', itemBatchId: '2', assignedQuantity: 1 }],
        }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(CreateMaterialAllocationsDto, { allocations: [] })),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(CreateMaterialAllocationsDto, {
          allocations: [{ demandId: '1', itemBatchId: '2', assignedQuantity: 1.25 }],
        }),
      ),
    ).not.toHaveLength(0);
  });
  it('rejects zero outbound quantities', async () => {
    expect(
      await validate(
        plainToInstance(CreateMaterialOutboundDto, {
          details: [{ allocationId: '1', outboundQuantity: 0 }],
        }),
      ),
    ).not.toHaveLength(0);
  });
});
