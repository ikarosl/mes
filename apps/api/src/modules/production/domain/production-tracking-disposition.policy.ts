import type {
  CreateProductionTrackingAbnormalityPayload,
  HandleProductionTrackingAbnormalityPayload,
} from '@company/contracts';
import { PRODUCTION_TRACKING_ABNORMALITY_RESOLUTION_LABELS } from '@company/constants';
import { MAX_PERSISTED_INTEGER_QUANTITY } from './integer-quantity.js';
import { ProductionDomainError } from './production.errors.js';

function requireQuantity(value: number, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > MAX_PERSISTED_INTEGER_QUANTITY)
    throw new ProductionDomainError('INVALID_INPUT', '数量必须是允许范围内的整数');
}

function requireOpenAffectedQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 0)
    throw new ProductionDomainError('INVALID_INPUT', '未处理异常影响数量合计必须是非负整数');
}

export function requireTrackingAffectedQuantity(
  affected: number,
  current: number,
  openAffected: number,
): void {
  requireQuantity(affected, 1);
  requireOpenAffectedQuantity(openAffected);
  if (affected > current - openAffected)
    throw new ProductionDomainError(
      'INVALID_INPUT',
      '本次异常影响数量与未处理异常影响数量合计不能超过当前盘量',
    );
}

export function requireTrackingCorrectedQuantity(quantity: number, openAffected: number): void {
  requireQuantity(quantity, 1);
  requireOpenAffectedQuantity(openAffected);
  if (quantity < openAffected)
    throw new ProductionDomainError('INVALID_INPUT', '更正后的盘量不能小于未处理异常影响数量合计');
}

export function requireTrackingDispositionQuantities(
  affected: number,
  current: number,
  payload: TrackingAbnormalityDisposition,
): void {
  requireQuantity(payload.repairedQuantity, 0);
  requireQuantity(payload.scrappedQuantity, 0);
  const newlyDisposed = payload.repairedQuantity + payload.scrappedQuantity;
  if (newlyDisposed > current)
    throw new ProductionDomainError(
      'INVALID_INPUT',
      '返修数量与本次新增报废数量之和不能超过当前剩余盘量',
    );
  const handlingIds = new Set<string>();
  let referencedQuantity = 0;
  for (const reference of payload.scrapReferences) {
    requireQuantity(reference.quantity, 1);
    if (handlingIds.has(reference.handlingId))
      throw new ProductionDomainError('INVALID_INPUT', '一次异常处理不能重复关联同一报废来源');
    handlingIds.add(reference.handlingId);
    referencedQuantity += reference.quantity;
  }
  if (newlyDisposed + referencedQuantity !== affected)
    throw new ProductionDomainError(
      'INVALID_INPUT',
      '返修、本次新增报废及关联已有报废数量之和必须等于异常影响数量',
    );
}

interface TrackingAbnormalityDisposition {
  content: string;
  repairedQuantity: number;
  scrappedQuantity: number;
  scrapReferences: { handlingId: string; quantity: number }[];
}

export function resolveTrackingAbnormalityReportHandling(
  payload: CreateProductionTrackingAbnormalityPayload,
): HandleProductionTrackingAbnormalityPayload | null {
  if (payload.mixedScrappedQuantity !== undefined) {
    if (payload.resolution !== undefined)
      throw new ProductionDomainError('INVALID_INPUT', '混合处置不能同时选择全部返修或全部报废');
    requireQuantity(payload.affectedQuantity, 1);
    requireQuantity(payload.mixedScrappedQuantity, 1);
    if (payload.mixedScrappedQuantity >= payload.affectedQuantity)
      throw new ProductionDomainError('INVALID_INPUT', '混合处置的报废数量必须小于异常影响数量');
    return {
      version: 0,
      personnelId: payload.personnelId,
      content: `${PRODUCTION_TRACKING_ABNORMALITY_RESOLUTION_LABELS.repair}并${PRODUCTION_TRACKING_ABNORMALITY_RESOLUTION_LABELS.scrap}`,
      repairedQuantity: payload.affectedQuantity - payload.mixedScrappedQuantity,
      scrappedQuantity: payload.mixedScrappedQuantity,
      scrapReferences: [],
    };
  }
  if (!payload.resolution) return null;
  return { version: 0, personnelId: payload.personnelId, resolution: payload.resolution };
}

export function resolveTrackingAbnormalityDisposition(
  payload: HandleProductionTrackingAbnormalityPayload,
  affectedQuantity: number,
): TrackingAbnormalityDisposition {
  if (payload.resolution) {
    if (
      !Object.hasOwn(PRODUCTION_TRACKING_ABNORMALITY_RESOLUTION_LABELS, payload.resolution) ||
      payload.content !== undefined ||
      payload.repairedQuantity !== undefined ||
      payload.scrappedQuantity !== undefined ||
      payload.scrapReferences !== undefined
    )
      throw new ProductionDomainError('INVALID_INPUT', '请选择返修或报废，或填写高级数量结算');
    return {
      content: PRODUCTION_TRACKING_ABNORMALITY_RESOLUTION_LABELS[payload.resolution],
      repairedQuantity: payload.resolution === 'repair' ? affectedQuantity : 0,
      scrappedQuantity: payload.resolution === 'scrap' ? affectedQuantity : 0,
      scrapReferences: [],
    };
  }
  if (
    !payload.content?.trim() ||
    payload.repairedQuantity === undefined ||
    payload.scrappedQuantity === undefined ||
    !Array.isArray(payload.scrapReferences)
  )
    throw new ProductionDomainError('INVALID_INPUT', '请完整填写高级数量结算和处理说明');
  return {
    content: payload.content.trim(),
    repairedQuantity: payload.repairedQuantity,
    scrappedQuantity: payload.scrappedQuantity,
    scrapReferences: payload.scrapReferences,
  };
}
