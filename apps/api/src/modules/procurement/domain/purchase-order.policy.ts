import type {
  CorrectPurchaseOrderAmountsPayload,
  CreatePurchaseOrderPayload,
} from '@company/contracts';
import {
  PROCUREMENT_ERROR_CODES,
  PURCHASE_ORDER_MAX_DEMANDS,
  PURCHASE_ORDER_MAX_LINES,
  PURCHASE_ORDER_MAX_QUANTITY,
} from '@company/constants';
import { calculatePurchaseLineAmount } from '@company/utils';
import { ProcurementDomainError } from './procurement.errors.js';

export const normalizePurchaseLineAmount = (
  input: Parameters<typeof calculatePurchaseLineAmount>[0],
): ReturnType<typeof calculatePurchaseLineAmount> => {
  try {
    return calculatePurchaseLineAmount(input);
  } catch (error) {
    if (error instanceof RangeError)
      throw new ProcurementDomainError(PROCUREMENT_ERROR_CODES.invalidPurchaseOrder, error.message);
    throw error;
  }
};

export const normalizePurchaseAmountsCorrection = (
  payload: CorrectPurchaseOrderAmountsPayload,
): CorrectPurchaseOrderAmountsPayload => {
  if (!payload.items.length || payload.items.length > PURCHASE_ORDER_MAX_LINES)
    throw new ProcurementDomainError(
      PROCUREMENT_ERROR_CODES.invalidPurchaseOrder,
      '金额更正须包含 1～100 条已变更明细',
    );
  const reason = payload.reason.trim();
  if (!reason || reason.length > 2000)
    throw new ProcurementDomainError(
      PROCUREMENT_ERROR_CODES.invalidPurchaseOrder,
      '金额更正须填写不超过 2000 字的原因',
    );
  const lineIds = new Set<string>();
  const items = payload.items.map((item) => {
    if (lineIds.has(item.id))
      throw new ProcurementDomainError(
        PROCUREMENT_ERROR_CODES.invalidPurchaseOrder,
        '金额更正不能重复提交同一采购行',
      );
    lineIds.add(item.id);
    if (
      (typeof item.taxExclusiveAmount !== 'string' && item.taxExclusiveAmount !== null) ||
      (typeof item.taxInclusiveAmount !== 'string' && item.taxInclusiveAmount !== null)
    )
      throw new ProcurementDomainError(
        PROCUREMENT_ERROR_CODES.invalidPurchaseOrder,
        '两项采购单价须明确填写十进制字符串或 null',
      );
    const amount = normalizePurchaseLineAmount({
      plannedQuantity: 1,
      taxExclusiveAmount: item.taxExclusiveAmount,
      taxInclusiveAmount: item.taxInclusiveAmount,
      taxRatePercent: item.taxRatePercent,
      manualTotalAmount: item.manualTotalAmount,
    });
    return {
      id: item.id,
      version: item.version,
      taxExclusiveAmount: amount.taxExclusiveAmount,
      taxInclusiveAmount: amount.taxInclusiveAmount,
      taxRatePercent: amount.taxRatePercent,
      manualTotalAmount: amount.manualTotalAmount,
    };
  });
  return { version: payload.version, items, reason };
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
    const amount = normalizePurchaseLineAmount(line);
    return {
      itemId: line.itemId,
      materialVariantId: line.materialVariantId,
      plannedQuantity: line.plannedQuantity,
      taxExclusiveAmount: amount.taxExclusiveAmount,
      taxInclusiveAmount: amount.taxInclusiveAmount,
      taxRatePercent: amount.taxRatePercent,
      manualTotalAmount: amount.manualTotalAmount,
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
