import type { ProcessRouteSnapshot, ProductQueryResult } from './product-snapshot.query.js';

/** Production 草稿与下达的 Product 资格边界；复用调用方事务，不写 BOM 批准事实。 */
export abstract class ProductProductionDefinitionCommand {
  abstract requireRouteForProductionDraft(
    routeId: string,
  ): Promise<ProductQueryResult<{ id: string }>>;
  abstract requireApprovedBomForProductionTask(
    productId: string,
    requestedRouteId: string | null,
  ): Promise<ProductQueryResult<ProcessRouteSnapshot>>;
}
