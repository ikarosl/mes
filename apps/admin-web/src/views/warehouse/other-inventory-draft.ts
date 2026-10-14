import type {
  InventoryInboundTarget,
  OtherInventoryItemKind,
  OtherInventoryLine,
  OtherStockCandidate,
  OtherStockObject,
} from '@company/contracts';

export interface OtherInventoryDraftLine {
  key: string;
  id?: string;
  lineNo?: number;
  itemKind: OtherInventoryItemKind;
  object: OtherStockObject | null;
  objectVerified: boolean;
  batch: OtherStockCandidate | null;
  target: InventoryInboundTarget;
  quantity: number | undefined;
  remark: string;
}

export const newOtherInventoryBatchKey = (): string => `draft-${crypto.randomUUID()}`;

export const newOtherInventoryDraftLine = (isInbound: boolean): OtherInventoryDraftLine => {
  const key = newOtherInventoryBatchKey();
  return {
    key,
    itemKind: 'material',
    object: null,
    objectVerified: false,
    batch: null,
    target: isInbound ? { mode: 'new', clientKey: key } : { mode: 'existing', batchId: '' },
    quantity: 1,
    remark: '',
  };
};

export const otherInventoryDraftLineFromDetail = (
  line: OtherInventoryLine,
): OtherInventoryDraftLine => ({
  key: `saved-${line.id}`,
  id: line.id,
  lineNo: line.lineNo,
  itemKind: line.itemKind,
  object: {
    id: line.materialVariantId ?? line.productId ?? '',
    itemKind: line.itemKind,
    itemId: line.itemId,
    materialVariantId: line.materialVariantId,
    productId: line.productId,
    code: line.itemCode,
    name: line.itemName,
    materialVariantCode: line.materialVariantCode,
    unit: line.unit,
  },
  objectVerified: false,
  batch: line.batchId
    ? {
        batchId: line.batchId,
        batchCode: line.batchCode ?? '',
        itemKind: line.itemKind,
        itemId: line.itemId,
        materialVariantId: line.materialVariantId,
        productId: line.productId,
        itemCode: line.itemCode,
        itemName: line.itemName,
        materialVariantCode: line.materialVariantCode,
        unit: line.unit,
        availableQuantity: '-',
        reservedQuantity: '-',
        usableQuantity: '-',
      }
    : null,
  target:
    line.targetMode === 'new'
      ? { mode: 'new', clientKey: line.newBatchKey ?? '' }
      : { mode: 'existing', batchId: line.batchId ?? '' },
  quantity: Number(line.quantity),
  remark: line.remark ?? '',
});

export const otherInventoryDraftIdentity = (line: OtherInventoryDraftLine): string =>
  `${line.itemKind}:${line.object?.id ?? ''}:${line.object?.unit ?? ''}`;
