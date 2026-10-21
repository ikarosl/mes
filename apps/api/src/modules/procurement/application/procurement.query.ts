import { Injectable } from '@nestjs/common';
import type { RelatedPurchasesQuery, RelatedPurchasesResult } from '@company/contracts';
import { PurchaseOrderRepository } from './ports/purchase-order.repository.js';

/** 需求来源的历史关联投影，不按当前新下单资格过滤，也不分摊采购量。 */
@Injectable()
export class ProcurementQuery {
  constructor(private readonly orders: PurchaseOrderRepository) {}
  listRelatedPurchases(query: RelatedPurchasesQuery): Promise<RelatedPurchasesResult> {
    return this.orders.related({ ...query, page: query.page ?? 1, pageSize: query.pageSize ?? 10 });
  }
}
