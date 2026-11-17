import type { InventoryBatchItem } from '@company/contracts';

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
