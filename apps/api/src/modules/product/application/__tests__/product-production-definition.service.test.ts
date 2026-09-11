import { describe, expect, it, vi } from 'vitest';
import { ProductDomainError } from '../../domain/product.errors.js';
import { ProductProductionDefinitionService } from '../product-production-definition.service.js';

const audit = { actorId: '7', requestId: 'request-1', ip: null, userAgent: null };

describe('ProductProductionDefinitionService', () => {
  it('delegates approved-BOM task eligibility through the Product-owned read port', async () => {
    const route = { id: '3', routeCode: 'R-1', routeName: '路线', versionNo: 'V1', steps: [] };
    const repository = { requireApprovedBomForProductionTask: vi.fn().mockResolvedValue(route) };
    const service = new ProductProductionDefinitionService(repository as never);

    await expect(service.requireApprovedBomForProductionTask('2', '3', audit)).resolves.toEqual({
      status: 'success',
      value: route,
    });
    expect(repository.requireApprovedBomForProductionTask).toHaveBeenCalledWith('2', '3', audit);
  });

  it('maps expected Product failures without leaking the internal exception type', async () => {
    const repository = {
      requireApprovedBomForProductionTask: vi
        .fn()
        .mockRejectedValue(new ProductDomainError('INVALID_MATERIAL', 'BOM 不可用')),
    };
    const service = new ProductProductionDefinitionService(repository as never);

    await expect(service.requireApprovedBomForProductionTask('2', null, audit)).resolves.toEqual({
      status: 'invalid-input',
      message: 'BOM 不可用',
    });
  });
});
