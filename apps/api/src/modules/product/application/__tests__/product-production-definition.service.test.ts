import { describe, expect, it, vi } from 'vitest';
import { ProductDomainError } from '../../domain/product.errors.js';
import { ProductProductionDefinitionService } from '../product-production-definition.service.js';

const audit = { actorId: '7', requestId: 'request-1', ip: null, userAgent: null };

describe('ProductProductionDefinitionService', () => {
  it('delegates the first-task BOM lock through the Product-owned write port', async () => {
    const route = { id: '3', product: { id: '2' }, steps: [] };
    const repository = { lockBomForProductionTask: vi.fn().mockResolvedValue(route) };
    const service = new ProductProductionDefinitionService(repository as never);

    await expect(service.lockBomForProductionTask('2', '3', audit)).resolves.toEqual({
      status: 'success',
      value: route,
    });
    expect(repository.lockBomForProductionTask).toHaveBeenCalledWith('2', '3', audit);
  });

  it('maps expected Product failures without leaking the internal exception type', async () => {
    const repository = {
      lockBomForProductionTask: vi
        .fn()
        .mockRejectedValue(new ProductDomainError('INVALID_MATERIAL', 'BOM 不可用')),
    };
    const service = new ProductProductionDefinitionService(repository as never);

    await expect(service.lockBomForProductionTask('2', null, audit)).resolves.toEqual({
      status: 'invalid-input',
      message: 'BOM 不可用',
    });
  });
});
