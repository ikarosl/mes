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
  const demands = new Set<string>();
  const items = payload.items.map((line) => {
    const identity = `${line.itemId}:${line.materialVariantId}`;
    if (identities.has(identity)) invalid('相同物料精确版本必须合并为一条采购行');
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
    for (const id of demandIds) {
      if (demands.has(id)) invalid('同一需求不能在采购单内重复关联');
      demands.add(id);
    }
    return { ...line, demandIds };
  });
  if (demands.size > PURCHASE_ORDER_MAX_DEMANDS) invalid('单张采购单最多关联 100 条需求');
  return {
    supplierId: payload.supplierId,
    sourceType: payload.sourceType,
    remark: payload.remark?.trim() || null,
    items,
  };
};
