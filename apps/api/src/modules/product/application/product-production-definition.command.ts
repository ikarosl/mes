import type { CommandContext } from '../../../common/audit/audit.types.js';
import type { ProcessRouteSnapshot, ProductQueryResult } from './product-snapshot.query.js';

/** Production 创建任务时使用的 Product 写边界；锁定与任务创建共享同一数据库事务。 */
export abstract class ProductProductionDefinitionCommand {
  abstract lockBomForProductionTask(
    productId: string,
    requestedRouteId: string | null,
    audit: CommandContext,
  ): Promise<ProductQueryResult<ProcessRouteSnapshot | null>>;
}
