import { Injectable } from '@nestjs/common';
import { ProductDomainError } from '../domain/product.errors.js';
import {
  ProductSnapshotQuery,
  type EnabledSopFileSnapshot,
  type ProcessRouteSnapshot,
  type ProductBomSnapshot,
  type ProductQueryFailure,
  type ProductQueryResult,
  type ProductionProductSnapshot,
  type InventoryItemDisplayReference,
  type InventoryItemReference,
} from './product-snapshot.query.js';
import { ProductSnapshotRepository } from './ports/product-snapshot.repository.js';

@Injectable()
export class ProductSnapshotService extends ProductSnapshotQuery {
  constructor(private readonly snapshots: ProductSnapshotRepository) {
    super();
  }

  listInventoryItemReferencesByIds(itemIds: string[]): Promise<InventoryItemReference[]> {
    return this.snapshots.listInventoryItemReferencesByIds(itemIds);
  }

  listInventoryItemDisplayReferencesByIds(
    itemIds: string[],
  ): Promise<InventoryItemDisplayReference[]> {
    return this.snapshots.listInventoryItemDisplayReferencesByIds(itemIds);
  }

  listRouteStepMaterialIds(routeStepId: string): Promise<string[]> {
    return this.snapshots.listRouteStepMaterialIds(routeStepId);
  }

  getProductionProduct(productId: string): Promise<ProductQueryResult<ProductionProductSnapshot>> {
    return this.toResult(() => this.snapshots.getProductionProduct(productId));
  }
  getProductionRouteSnapshot(
    productId: string,
    requestedRouteId: string | null,
  ): Promise<ProductQueryResult<ProcessRouteSnapshot | null>> {
    return this.toResult(() =>
      this.snapshots.getProductionRouteSnapshot(productId, requestedRouteId),
    );
  }
  getBomSnapshot(productId: string): Promise<ProductQueryResult<ProductBomSnapshot>> {
    return this.toResult(() => this.snapshots.getBomSnapshot(productId));
  }
  getRouteSnapshot(routeId: string): Promise<ProductQueryResult<ProcessRouteSnapshot>> {
    return this.toResult(() => this.snapshots.getRouteSnapshot(routeId));
  }
  getEnabledSopFileSnapshot(fileId: string): Promise<ProductQueryResult<EnabledSopFileSnapshot>> {
    return this.toResult(() => this.snapshots.getEnabledSopFileSnapshot(fileId));
  }

  private async toResult<T>(operation: () => Promise<T>): Promise<ProductQueryResult<T>> {
    try {
      return { status: 'success', value: await operation() };
    } catch (error) {
      if (error instanceof ProductDomainError) return toQueryFailure(error);
      throw error;
    }
  }
}

const toQueryFailure = (error: ProductDomainError): ProductQueryFailure =>
  error.code === 'NOT_FOUND'
    ? { status: 'not-found', message: error.message }
    : { status: 'invalid-input', message: error.message };
