import type { DemandCorrectionHistoryItem, ProductionMaterialDemandItem } from '@company/contracts';
import {
  DEMAND_BUSINESS_STATUS_LABELS,
  DEMAND_CORRECTION_STATE_LABELS,
  MATERIAL_DEMAND_PROGRESS_LABELS,
} from '@company/constants';
import type { StatusTagType } from '../shared/production-status';

export interface ProductionDemandTraceChain {
  rows: ProductionMaterialDemandItem[];
  error: string;
}

export interface ProductionDemandTraceTotals {
  issuedQuantity: number;
  remainingQuantity: number;
  currentTotalQuantity: number;
}

/** 替代链只沿服务端真实关系展开，不以 ID、创建时间或列表顺序推测前后继。 */
export function buildProductionDemandTraceChain(
  demands: readonly ProductionMaterialDemandItem[],
  demandId: string,
): ProductionDemandTraceChain {
  const rowsById = new Map(demands.map((row) => [row.demandId, row]));
  const selected = rowsById.get(demandId);
  if (!selected) return { rows: [], error: `需求 id:${demandId} 不在当前任务中，请刷新需求总览。` };
  if (rowsById.size !== demands.length)
    return { rows: [], error: '需求记录重复，请刷新后重新查看。' };

  const predecessors = new Map<string, Set<string>>();
  const successors = new Map<string, Set<string>>();
  const link = (previousId: string, nextId: string): void => {
    const previous = predecessors.get(nextId) ?? new Set<string>();
    previous.add(previousId);
    predecessors.set(nextId, previous);
    const next = successors.get(previousId) ?? new Set<string>();
    next.add(nextId);
    successors.set(previousId, next);
  };
  for (const row of demands) {
    if (row.correction?.replacesDemandId) link(row.correction.replacesDemandId, row.demandId);
    if (row.correction?.replacementDemandId) link(row.demandId, row.correction.replacementDemandId);
  }

  let firstId = demandId;
  const visitedAncestors = new Set<string>();
  while (true) {
    if (visitedAncestors.has(firstId))
      return { rows: [], error: '需求替代关系存在循环，请核对记录。' };
    visitedAncestors.add(firstId);
    const previousIds = predecessors.get(firstId);
    if (!previousIds?.size) break;
    if (previousIds.size !== 1)
      return { rows: [], error: `需求 id:${firstId} 存在多个替代来源，请核对记录。` };
    const previousId = [...previousIds][0];
    if (!previousId || !rowsById.has(previousId))
      return { rows: [], error: `需求 id:${firstId} 的替代来源未读取完整，请刷新。` };
    firstId = previousId;
  }

  const rows: ProductionMaterialDemandItem[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = firstId;
  while (currentId) {
    if (visited.has(currentId)) return { rows: [], error: '需求替代关系存在循环，请核对记录。' };
    visited.add(currentId);
    const row = rowsById.get(currentId);
    if (!row) return { rows: [], error: `需求 id:${currentId} 未读取完整，请刷新。` };
    if (
      row.productionBatchId !== selected.productionBatchId ||
      row.itemId !== selected.itemId ||
      row.materialVariantId !== selected.materialVariantId ||
      row.unit !== selected.unit
    )
      return { rows: [], error: '替代需求的任务、物料、精确版本或单位不一致，请核对记录。' };
    if ((predecessors.get(currentId)?.size ?? 0) > 1)
      return { rows: [], error: `需求 id:${currentId} 存在多个替代来源，请核对记录。` };
    rows.push(row);
    const nextIds = successors.get(currentId);
    if ((nextIds?.size ?? 0) > 1)
      return { rows: [], error: `需求 id:${currentId} 存在多个替代记录，请核对记录。` };
    currentId = nextIds ? [...nextIds][0] : undefined;
  }
  return { rows, error: '' };
}

export function productionDemandTraceTotals(
  rows: readonly ProductionMaterialDemandItem[],
): ProductionDemandTraceTotals | null {
  const latest = rows[rows.length - 1];
  if (!latest) return null;
  const quantities = rows.map((row) => Number(row.outboundQuantity));
  if (quantities.some((quantity) => !Number.isSafeInteger(quantity) || quantity < 0)) return null;
  const issuedQuantity = quantities.reduce((sum, quantity) => sum + quantity, 0);
  const remainingQuantity =
    latest.businessStatus === 'active' ? Number(latest.remainingDemandQuantity) : 0;
  const currentTotalQuantity = issuedQuantity + remainingQuantity;
  if (
    !Number.isSafeInteger(remainingQuantity) ||
    remainingQuantity < 0 ||
    !Number.isSafeInteger(currentTotalQuantity)
  )
    return null;
  return { issuedQuantity, remainingQuantity, currentTotalQuantity };
}

export function productionDemandTraceStatus(row: ProductionMaterialDemandItem): {
  label: string;
  type: StatusTagType;
} {
  if (row.correction?.pendingCorrectionId)
    return { label: MATERIAL_DEMAND_PROGRESS_LABELS.correction_pending, type: 'warning' };
  const label = DEMAND_BUSINESS_STATUS_LABELS[row.businessStatus];
  if (row.businessStatus === 'fulfilled') return { label, type: 'success' };
  if (row.businessStatus === 'cancelled') return { label, type: 'danger' };
  if (row.businessStatus === 'closed') return { label, type: 'info' };
  return { label, type: 'primary' };
}

export function productionDemandTraceProgressLabel(row: ProductionMaterialDemandItem): string {
  return MATERIAL_DEMAND_PROGRESS_LABELS[row.demandProgressStatus];
}

export function productionDemandCorrectionHistoryStatus(row: DemandCorrectionHistoryItem): {
  label: string;
  type: StatusTagType;
} {
  const label = DEMAND_CORRECTION_STATE_LABELS[row.state];
  if (row.state === 'applied') return { label, type: 'success' };
  if (row.state === 'pending') return { label, type: 'warning' };
  return { label, type: 'info' };
}

export function productionDemandCorrectionReplacementLabel(
  row: DemandCorrectionHistoryItem,
): string {
  if (row.newDemandId) return `id:${row.newDemandId}`;
  if (row.state === 'applied') return '无替代需求（剩余为零）';
  if (row.state === 'ended') return '未生成替代需求';
  return row.snapshot.newRemainingQuantity > 0
    ? '生效后创建替代需求'
    : '不创建替代需求（剩余为零）';
}
