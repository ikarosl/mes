import type { ProcessRouteSnapshot } from '../product-snapshot.query.js';

export abstract class ProductProductionDefinitionRepository {
  abstract requireRouteForProductionDraft(routeId: string): Promise<{ id: string }>;
  abstract requireApprovedBomForProductionTask(
    productId: string,
    requestedRouteId: string | null,
  ): Promise<ProcessRouteSnapshot>;
}
