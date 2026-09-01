import type { InventoryBatchTransactionItem } from '@company/contracts';

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
