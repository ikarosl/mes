import { FINISHED_GOODS_INBOUND_SOURCES } from '@company/constants';
import type {
  InventoryBatchItem,
  InventoryBatchTransactionItem,
  InventorySourceType,
} from '@company/contracts';

export const inventoryBatchProviderText = (row: InventoryBatchItem): string => {
  if (row.provider) return row.provider;
  const providers = [
    ...new Set(row.inboundSources.flatMap((source) => (source.provider ? [source.provider] : []))),
  ];
  if (providers.length > 1) return '多供应方，见入库明细';
  if (providers.length === 1) return `${providers[0]}（部分来源未记录供应方）`;
  return '未记录供应方';
};

const sourceAssociationText = (
  documentNo: string | null,
  ids: Array<string | null>,
  label: string,
): string => {
  if (documentNo) return documentNo;
  const recordedIds = new Set(ids.filter((id) => id !== null));
  if (recordedIds.size === 0) return `无来源${label}`;
  if (recordedIds.size > 1) return `多来源${label}，见入库明细`;
  return ids.some((id) => id === null)
    ? `部分来源关联${label}，见入库明细`
    : `来源${label}见入库明细`;
};

export const inventoryBatchWorkOrderText = (row: InventoryBatchItem): string =>
  sourceAssociationText(
    row.sourceWorkOrderNo,
    row.inboundSources.map((source) => source.workOrderId),
    '工单',
  );

export const inventoryBatchProductionBatchText = (row: InventoryBatchItem): string =>
  sourceAssociationText(
    row.sourceProductionBatchNo,
    row.inboundSources.map((source) => source.productionBatchId),
    '任务',
  );

/** 仅为支持入库单 ID 定位的来源提供跳转，其他来源保留真实单号。 */
export const inventoryInboundRouteName = (sourceType: InventorySourceType): string | null => {
  if (sourceType === 'purchased') return 'warehouse-inbound';
  if (
    sourceType === 'finished_product' ||
    FINISHED_GOODS_INBOUND_SOURCES.some((source) => source === sourceType)
  )
    return 'warehouse-inbound-finished';
  return null;
};

const BUSINESS_GROUP_LABELS: Record<string, string> = {
  STOCKCHECK: '盘点单',
  RETURN: '退料单',
};

export const inventoryTransactionAssociationText = (
  row: Pick<
    InventoryBatchTransactionItem,
    'reversalOfInventoryTransactionId' | 'transactionGroupKey'
  >,
) => {
  if (row.reversalOfInventoryTransactionId)
    return `冲销流水 #${row.reversalOfInventoryTransactionId}`;
  if (!row.transactionGroupKey) return '-';
  const separator = row.transactionGroupKey.indexOf(':');
  if (separator > 0) {
    const prefix = row.transactionGroupKey.slice(0, separator);
    const businessId = row.transactionGroupKey.slice(separator + 1);
    const label = BUSINESS_GROUP_LABELS[prefix];
    if (label && businessId) return `${label} #${businessId}`;
  }
  return `业务分组 ${row.transactionGroupKey}`;
};
