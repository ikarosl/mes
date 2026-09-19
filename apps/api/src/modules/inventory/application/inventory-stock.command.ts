import type { StockStatus } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';

export interface InventoryMaterialBatchReference {
  id: string;
  itemId: string;
  materialVariantId: string;
  itemCode: string;
  itemName: string;
  materialVariantCode: string;
  unit: string;
  batchCode: string;
  batchStatus: 'available' | 'frozen' | 'disabled';
  availableQuantity: string;
}

export interface InventoryProductionMovement {
  itemId: string;
  materialVariantId: string;
  batchId: string;
  quantity: string;
  unit: string;
  detailId: string;
  remark?: string | null;
}

/** 调用者必须已开启同池业务事务。库存身份锁不代替来源业务资格。 */
export abstract class InventoryStockCommand {
  abstract lockMaterialBatches(ids: string[]): Promise<InventoryMaterialBatchReference[]>;
  abstract materialBatchReferences(ids: string[]): Promise<InventoryMaterialBatchReference[]>;
  abstract materialTransactionReferences(
    referenceType: 'return_detail' | 'outbound_detail',
    detailIds: string[],
  ): Promise<Array<{ detailId: string; transactionId: string }>>;
  abstract recordProductionOutbound(
    orderId: string,
    lines: InventoryProductionMovement[],
    context: CommandContext,
  ): Promise<void>;
  abstract recordProductionReturn(
    orderId: string,
    lines: InventoryProductionMovement[],
    context: CommandContext,
  ): Promise<void>;
  abstract materialQuantity(batchId: string, stockStatus: StockStatus): Promise<string>;
}
