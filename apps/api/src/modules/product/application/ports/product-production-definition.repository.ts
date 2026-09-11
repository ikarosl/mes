import type { CommandContext } from '../../../../common/audit/audit.types.js';
import type { ProcessRouteSnapshot } from '../product-snapshot.query.js';

export abstract class ProductProductionDefinitionRepository {
  abstract requireApprovedBomForProductionTask(
    productId: string,
    requestedRouteId: string | null,
    audit: CommandContext,
  ): Promise<ProcessRouteSnapshot | null>;
}
