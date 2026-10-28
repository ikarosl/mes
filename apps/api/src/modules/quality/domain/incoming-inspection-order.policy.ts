import {
  QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS,
  QUALITY_INCOMING_INSPECTION_ORDER_REMARK_MAX_LENGTH,
} from '@company/constants';
import type {
  QualityIncomingInspectionAssociationChange,
  QualityIncomingInspectionExpectedOrder,
  QualityIncomingInspectionInitialReceipt,
} from '@company/contracts';
import { QualityCommandError } from '../quality-command.error.js';

export function normalizeIncomingInspectionOrderRemark(value: string | null | undefined) {
  if (value != null && typeof value !== 'string') invalid('质检主单备注格式不正确');
  const remark = value?.trim() || null;
  if (remark !== null && remark.length > QUALITY_INCOMING_INSPECTION_ORDER_REMARK_MAX_LENGTH)
    invalid(`质检主单备注不能超过 ${QUALITY_INCOMING_INSPECTION_ORDER_REMARK_MAX_LENGTH} 字`);
  return remark;
}

export function requireIncomingInspectionReceipts(
  receipts: readonly QualityIncomingInspectionInitialReceipt[],
) {
  if (
    !Array.isArray(receipts) ||
    receipts.length < 1 ||
    receipts.length > QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS
  )
    invalid(`一次请选择 1～${QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS} 张到货`);
  const seen = new Set<string>();
  for (const receipt of receipts) {
    if (receipt == null || typeof receipt !== 'object') invalid('到货关联格式不正确');
    requireId(receipt.receiptId);
    if (receipt.fromOrderId !== null) requireId(receipt.fromOrderId);
    if (seen.has(receipt.receiptId)) invalid('同一次操作不能重复选择到货');
    seen.add(receipt.receiptId);
  }
}

export function requireIncomingInspectionChanges(
  changes: readonly QualityIncomingInspectionAssociationChange[],
) {
  requireIncomingInspectionReceipts(changes);
  for (const change of changes) {
    if (change.toOrderId !== null) requireId(change.toOrderId);
    if (change.fromOrderId === null && change.toOrderId === null)
      invalid('解除关联必须指定原质检主单');
  }
}

export function requireIncomingInspectionExpectedOrders(
  expected: readonly QualityIncomingInspectionExpectedOrder[],
  affectedIds: readonly string[],
) {
  if (
    !Array.isArray(expected) ||
    expected.length > QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS * 2
  )
    invalid('质检主单版本集合格式不正确');
  const versions = new Map<string, number>();
  for (const order of expected) {
    if (order == null || typeof order !== 'object') invalid('质检主单版本格式不正确');
    requireId(order.orderId);
    requireIncomingInspectionVersion(order.expectedVersion);
    if (versions.has(order.orderId)) invalid('质检主单版本不能重复');
    versions.set(order.orderId, order.expectedVersion);
  }
  const needed = new Set(affectedIds);
  if (versions.size !== needed.size || [...needed].some((id) => !versions.has(id)))
    invalid('请提供所有受影响质检主单的预期版本');
  return versions;
}

export function requireIncomingInspectionVersion(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 2147483647) invalid('质检主单版本不正确');
}

function requireId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,19}$/.test(value))
    invalid('到货或质检主单标识不正确');
}

function invalid(message: string): never {
  throw new QualityCommandError('INVALID_INPUT', message);
}
