import type { CreatePurchaseOrderPayload } from '@company/contracts';
import {
  PROCUREMENT_ERROR_CODES,
  PURCHASE_ORDER_MAX_DEMANDS,
  PURCHASE_ORDER_MAX_LINES,
  PURCHASE_ORDER_MAX_QUANTITY,
} from '@company/constants';
import { ProcurementDomainError } from './procurement.errors.js';

export const normalizePurchaseDraft = (
  payload: CreatePurchaseOrderPayload,
): CreatePurchaseOrderPayload => {
  const invalid = (message: string): never => {
    throw new ProcurementDomainError(PROCUREMENT_ERROR_CODES.invalidPurchaseOrder, message);
  };
  if (!payload.items.length || payload.items.length > PURCHASE_ORDER_MAX_LINES)
    invalid('采购单须包含 1～100 条物料行');
  const identities = new Set<string>();
  let sourceCount = 0;
  if (payload.sourceType === 'demand' && !payload.workOrderId) invalid('按需求采购须选择一个工单');
  if (payload.sourceType === 'stock' && payload.workOrderId !== null)
    invalid('独立备料采购不能关联工单');
  const items = payload.items.map((line) => {
    if (!line.supplierId) invalid('每条采购行须明确选择供应商');
    const identity = `${line.itemId}:${line.materialVariantId}:${line.supplierId}`;
    if (identities.has(identity)) invalid('相同物料、精确版本和供应商必须合并为一条采购行');
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
    return { ...line, demandIds };
  });
  if (sourceCount > PURCHASE_ORDER_MAX_DEMANDS) invalid('单张采购单最多包含 100 条需求来源映射');
  return {
    workOrderId: payload.workOrderId,
    sourceType: payload.sourceType,
    remark: payload.remark?.trim() || null,
    items,
  };
};
