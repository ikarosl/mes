import type { CommandContext } from '../../../common/audit/audit.types.js';
import type { ProcessRouteSnapshot, ProductQueryResult } from './product-snapshot.query.js';

/** Production 创建任务时使用的 Product 资格边界；当前读锁与任务创建共享同一数据库事务，不写 BOM 批准事实。 */
export abstract class ProductProductionDefinitionCommand {
  abstract requireApprovedBomForProductionTask(
    productId: string,
    requestedRouteId: string | null,
    audit: CommandContext,
  ): Promise<ProductQueryResult<ProcessRouteSnapshot | null>>;
}
