import type { CommandContext } from '../../../common/audit/audit.types.js';

export interface InventoryProductionDocumentLineInput {
  allocationId: string;
  demandId: string;
  itemId: string;
  materialVariantId: string;
  batchId: string;
  quantity: string;
  unit: string;
  remark?: string | null;
}

export interface InventoryProductionDocumentInput {
  productionBatchId: string;
  workOrderId: string;
  remark?: string | null;
  lines: InventoryProductionDocumentLineInput[];
}

export interface InventoryProductionDocumentLine extends InventoryProductionDocumentLineInput {
  id: string;
}

/** 只返回生产来源资格所需的事实值；展示元数据由登记查询读取。 */
export interface InventoryProductionDocument {
  id: string;
  no: string;
  productionBatchId: string;
  workOrderId: string;
  status: 'pending' | 'completed' | 'cancelled';
  version: number;
  details: InventoryProductionDocumentLine[];
}

export interface InventoryProductionDocumentFactsFilter {
  productionBatchId?: string;
  allocationIds?: string[];
  demandIds?: string[];
  lock?: boolean;
}

export interface InventoryProductionDocumentFacts {
  outbounds: InventoryProductionDocument[];
  returns: InventoryProductionDocument[];
}

/** 来源模块先锁来源根及验证业务资格；所有写入复用调用者同池事务。 */
export abstract class InventoryProductionDocumentCommand {
  abstract getOutbound(id: string, lock?: boolean): Promise<InventoryProductionDocument>;
  abstract getReturn(id: string, lock?: boolean): Promise<InventoryProductionDocument>;
  abstract createOutbound(
    input: InventoryProductionDocumentInput,
    context: CommandContext,
  ): Promise<InventoryProductionDocument>;
  abstract createReturn(
    input: InventoryProductionDocumentInput,
    context: CommandContext,
  ): Promise<InventoryProductionDocument>;
  abstract completeOutbound(
    id: string,
    version: number,
    context: CommandContext,
  ): Promise<InventoryProductionDocument>;
  abstract completeReturn(
    id: string,
    version: number,
    context: CommandContext,
  ): Promise<InventoryProductionDocument>;
  abstract cancelOutbound(
    id: string,
    version: number,
    reason: string,
    cancelSource: 'manual' | 'production_batch' | 'production_termination',
    context: CommandContext,
  ): Promise<InventoryProductionDocument>;
  abstract cancelReturn(
    id: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<InventoryProductionDocument>;
  /** 至少一个范围；多个范围取交集。lock=true 只当前读自有公共单据，NOWAIT 冲突整体重试。 */
  abstract facts(
    filter: InventoryProductionDocumentFactsFilter,
  ): Promise<InventoryProductionDocumentFacts>;
}
