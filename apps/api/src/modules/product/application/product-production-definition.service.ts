import { Injectable } from '@nestjs/common';
import { ProductDomainError } from '../domain/product.errors.js';
import { ProductProductionDefinitionCommand } from './product-production-definition.command.js';
import { ProductProductionDefinitionRepository } from './ports/product-production-definition.repository.js';
import type {
  ProcessRouteSnapshot,
  ProductQueryFailure,
  ProductQueryResult,
} from './product-snapshot.query.js';

@Injectable()
export class ProductProductionDefinitionService extends ProductProductionDefinitionCommand {
  constructor(private readonly definitions: ProductProductionDefinitionRepository) {
    super();
  }

  async requireRouteForProductionDraft(
    routeId: string,
  ): Promise<ProductQueryResult<{ id: string }>> {
    try {
      return {
        status: 'success',
        value: await this.definitions.requireRouteForProductionDraft(routeId),
      };
    } catch (error) {
      if (error instanceof ProductDomainError) return toFailure(error);
      throw error;
    }
  }

  async requireApprovedBomForProductionTask(
    productId: string,
    requestedRouteId: string | null,
  ): Promise<ProductQueryResult<ProcessRouteSnapshot>> {
    try {
      return {
        status: 'success',
        value: await this.definitions.requireApprovedBomForProductionTask(
          productId,
          requestedRouteId,
        ),
      };
    } catch (error) {
      if (error instanceof ProductDomainError) return toFailure(error);
      throw error;
    }
  }
}

const toFailure = (error: ProductDomainError): ProductQueryFailure =>
  error.code === 'NOT_FOUND'
    ? { status: 'not-found', message: error.message }
    : { status: 'invalid-input', message: error.message };
