import type { CreatePurchaseOrderPayload } from '@company/contracts';
import {
  PROCUREMENT_ERROR_CODES,
  PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH,
  PURCHASE_ORDER_MAX_DEMANDS,
  PURCHASE_ORDER_MAX_LINES,
  PURCHASE_ORDER_MAX_QUANTITY,
} from '@company/constants';
import { ProcurementDomainError } from './procurement.errors.js';

export const normalizePurchaseAmountText = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string')
    throw new ProcurementDomainError(
      PROCUREMENT_ERROR_CODES.invalidPurchaseOrder,
      '采购金额须为文本',
    );
  const text = value.trim();
  if ([...text].length > PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH)
    throw new ProcurementDomainError(
      PROCUREMENT_ERROR_CODES.invalidPurchaseOrder,
      `采购金额文本最多 ${PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH} 字符`,
    );
  return text || null;
};

export const normalizePurchaseDraft = (
  payload: CreatePurchaseOrderPayload,
): CreatePurchaseOrderPayload => {
  const invalid = (message: string): never => {
    throw new ProcurementDomainError(PROCUREMENT_ERROR_CODES.invalidPurchaseOrder, message);
  };
  if (!payload.items.length || payload.items.length > PURCHASE_ORDER_MAX_LINES)
    invalid('采购单须包含 1～100 条物料行');
  if (!payload.supplierId) invalid('采购单须明确选择供应商');
  const identities = new Set<string>();
  let sourceCount = 0;
  if (payload.sourceType === 'demand' && !payload.workOrderId) invalid('按需求采购须选择一个工单');
  if (payload.sourceType === 'stock' && payload.workOrderId !== null)
    invalid('独立备料采购不能关联工单');
  const items = payload.items.map((line) => {
    const identity = `${line.itemId}:${line.materialVariantId}`;
    if (identities.has(identity)) invalid('相同物料和精确版本必须合并为一条采购行');
    identities.add(identity);
    if (
      !Number.isSafeInteger(line.plannedQuantity) ||
      line.plannedQuantity < 1 ||
      line.plannedQuantity > PURCHASE_ORDER_MAX_QUANTITY
    )
      invalid('采购量必须是 1～99999999 的整数');
    const demandIds = [...new Set(line.demandIds)].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
    if (payload.sourceType === 'demand' && !demandIds.length)
      invalid('按需求采购的每行必须选择真实需求来源');
    if (payload.sourceType === 'stock' && demandIds.length) invalid('独立备料采购不能关联生产需求');
    if (demandIds.length !== line.demandIds.length) invalid('同一采购行不能重复关联需求');
    sourceCount += demandIds.length;
    return {
      itemId: line.itemId,
      materialVariantId: line.materialVariantId,
      plannedQuantity: line.plannedQuantity,
      taxExclusiveAmount: normalizePurchaseAmountText(line.taxExclusiveAmount),
      taxInclusiveAmount: normalizePurchaseAmountText(line.taxInclusiveAmount),
      demandIds,
    };
  });
  if (sourceCount > PURCHASE_ORDER_MAX_DEMANDS) invalid('单张采购单最多包含 100 条需求来源映射');
  return {
    supplierId: payload.supplierId,
    workOrderId: payload.workOrderId,
    sourceType: payload.sourceType,
    remark: payload.remark?.trim() || null,
    items,
  };
};
